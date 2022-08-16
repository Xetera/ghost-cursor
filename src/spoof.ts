import { ElementHandle, Page, BoundingBox, CDPSession } from 'puppeteer'
import {
  Vector,
  bezierCurve,
  direction,
  magnitude,
  origin,
  overshoot
} from './math'
export { default as installMouseHelper } from './mouse-helper'

interface BoxOptions {
  readonly paddingPercentage: number
}
interface MoveOptions extends BoxOptions {
  readonly waitForSelector: number
  readonly moveDelay?: number
  readonly maxTries?: number
}
interface ClickOptions extends MoveOptions {
  readonly waitForClick: number
}
export interface GhostCursor {
  toggleRandomMove: (random: boolean) => void
  click: (
    selector?: string | ElementHandle,
    options?: ClickOptions
  ) => Promise<void>
  move: (
    selector: string | ElementHandle,
    options?: MoveOptions
  ) => Promise<void>
  moveTo: (destination: Vector) => Promise<void>
}

// Helper function to wait a specified number of milliseconds
const delay = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Calculate the amount of time needed to move from (x1, y1) to (x2, y2)
 * given the width of the element being clicked on
 * https://en.wikipedia.org/wiki/Fitts%27s_law
 */
const fitts = (distance: number, width: number): number => {
  const a = 0
  const b = 2
  const id = Math.log2(distance / width + 1)
  return a + b * id
}

// Get a random point on a box
const getRandomBoxPoint = (
  { x, y, width, height }: BoundingBox,
  options?: BoxOptions
): Vector => {
  let paddingWidth = 0
  let paddingHeight = 0

  if (
    options?.paddingPercentage !== undefined &&
    options?.paddingPercentage > 0 &&
    options?.paddingPercentage < 100
  ) {
    paddingWidth = (width * options.paddingPercentage) / 100
    paddingHeight = (height * options.paddingPercentage) / 100
  }

  return {
    x: x + paddingWidth / 2 + Math.random() * (width - paddingWidth),
    y: y + paddingHeight / 2 + Math.random() * (height - paddingHeight)
  }
}

// The function signature to access the internal CDP client changed in puppeteer 14.4.1
const getCDPClient = (page: any): CDPSession => typeof page._client === 'function' ? page._client() : page._client

// Get a random point on a browser window
export const getRandomPagePoint = async (page: Page): Promise<Vector> => {
  const targetId: string = (page.target() as any)._targetId
  const window = await getCDPClient(page).send(
    'Browser.getWindowForTarget',
    { targetId }
  )
  return getRandomBoxPoint({
    x: origin.x,
    y: origin.y,
    width: window.bounds.width ?? 0,
    height: window.bounds.height ?? 0
  })
}

// Using this method to get correct position of Inline elements (elements like <a>)
const getElementBox = async (
  page: Page,
  element: ElementHandle,
  relativeToMainFrame: boolean = true
): Promise<BoundingBox | null> => {
  const objectId: string = (element as any).remoteObject()?.objectId
  if (objectId === undefined) {
    return null
  }

  try {
    const quads = await getCDPClient(page).send('DOM.getContentQuads', {
      objectId
    })
    const elementBox = {
      x: quads.quads[0][0],
      y: quads.quads[0][1],
      width: quads.quads[0][4] - quads.quads[0][0],
      height: quads.quads[0][5] - quads.quads[0][1]
    }
    if (!relativeToMainFrame) {
      const elementFrame = element.executionContext().frame()
      const iframes =
        elementFrame != null
          ? await elementFrame.parentFrame()?.$x('//iframe')
          : null
      let frame: ElementHandle<Element> | undefined
      if (iframes != null) {
        for (const iframe of iframes) {
          if ((await iframe.contentFrame()) === elementFrame) frame = iframe
        }
      }
      if (frame != null) {
        const boundingBox = await frame.boundingBox()
        elementBox.x =
          boundingBox !== null ? elementBox.x - boundingBox.x : elementBox.x
        elementBox.y =
          boundingBox !== null ? elementBox.y - boundingBox.y : elementBox.y
      }
    }

    return elementBox
  } catch (_) {
    console.debug('Quads not found, trying regular boundingBox')
    return await element.boundingBox()
  }
}

export function path (point: Vector, target: Vector, spreadOverride?: number)
export function path (
  point: Vector,
  target: BoundingBox,
  spreadOverride?: number
)
export function path (
  start: Vector,
  end: BoundingBox | Vector,
  spreadOverride?: number
): Vector[] {
  const defaultWidth = 100
  const minSteps = 25
  const width = 'width' in end ? end.width : defaultWidth
  const curve = bezierCurve(start, end, spreadOverride)
  const length = curve.length() * 0.8
  const baseTime = Math.random() * minSteps
  const steps = Math.ceil((Math.log2(fitts(length, width) + 1) + baseTime) * 3)
  const re = curve.getLUT(steps)
  return clampPositive(re)
}

const clampPositive = (vectors: Vector[]): Vector[] => {
  const clamp0 = (elem: number): number => Math.max(0, elem)
  return vectors.map((vector) => {
    return {
      x: clamp0(vector.x),
      y: clamp0(vector.y)
    }
  })
}

const overshootThreshold = 500
const shouldOvershoot = (a: Vector, b: Vector): boolean =>
  magnitude(direction(a, b)) > overshootThreshold

const intersectsElement = (vec: Vector, box: BoundingBox): boolean => {
  return (
    vec.x > box.x &&
    vec.x <= box.x + box.width &&
    vec.y > box.y &&
    vec.y <= box.y + box.height
  )
}

const boundingBoxWithFallback = async (
  page: Page,
  elem: ElementHandle<Element>
): Promise<BoundingBox> => {
  let box = await getElementBox(page, elem)
  if (box == null) {
    box = (await elem.evaluate((el: Element) =>
      el.getBoundingClientRect()
    )) as BoundingBox
  }

  return box
}

export const createCursor = (
  page: Page,
  start: Vector = origin,
  performRandomMoves: boolean = false
): GhostCursor => {
  // this is kind of arbitrary, not a big fan but it seems to work
  const overshootSpread = 10
  const overshootRadius = 120
  let previous: Vector = start

  // Initial state: mouse is not moving
  let moving: boolean = false

  // Move the mouse over a number of vectors
  const tracePath = async (
    vectors: Iterable<Vector>,
    abortOnMove: boolean = false
  ): Promise<void> => {
    for (const v of vectors) {
      try {
        // In case this is called from random mouse movements and the users wants to move the mouse, abort
        if (abortOnMove && moving) {
          return
        }
        await page.mouse.move(v.x, v.y)
        previous = v
      } catch (error) {
        // Exit function if the browser is no longer connected
        if (!page.browser().isConnected()) return

        console.debug('Warning: could not move mouse, error message:', error)
      }
    }
  }
  // Start random mouse movements. Function recursively calls itself
  const randomMove = async (options?: MoveOptions): Promise<void> => {
    try {
      if (!moving) {
        const rand = await getRandomPagePoint(page)
        await tracePath(path(previous, rand), true)
        previous = rand
      }
      if (options?.moveDelay !== undefined && options.moveDelay >= 0) {
        await delay(Math.random() * options.moveDelay)
      } else {
        await delay(Math.random() * 2000) // 2s by default
      }
      randomMove().then(
        (_) => {},
        (_) => {}
      ) // fire and forget, recursive function
    } catch (_) {
      console.debug('Warning: stopping random mouse movements')
    }
  }

  const actions: GhostCursor = {
    toggleRandomMove (random: boolean): void {
      moving = !random
    },

    async click (
      selector?: string | ElementHandle,
      options?: ClickOptions
    ): Promise<void> {
      actions.toggleRandomMove(false)

      if (selector !== undefined) {
        await actions.move(selector, options)
        actions.toggleRandomMove(false)
      }

      try {
        await page.mouse.down()
        if (options?.waitForClick !== undefined) {
          await delay(options.waitForClick)
        }
        await page.mouse.up()
      } catch (error) {
        console.debug('Warning: could not click mouse, error message:', error)
      }

      if (options?.moveDelay !== undefined && options.moveDelay >= 0) {
        await delay(Math.random() * options.moveDelay)
      } else {
        await delay(Math.random() * 2000) // 2s by default
      }

      actions.toggleRandomMove(true)
    },
    async move (
      selector: string | ElementHandle,
      options?: MoveOptions
    ): Promise<void> {
      const go = async (iteration: number): Promise<void> => {
        if (iteration > (options?.maxTries ?? 10)) {
          throw Error('Could not mouse-over element within enough tries')
        }

        actions.toggleRandomMove(false)
        let elem: ElementHandle | null = null
        if (typeof selector === 'string') {
          if (selector.startsWith('//') || selector.startsWith('(//')) {
            if (options?.waitForSelector !== undefined) {
              await page.waitForXPath(selector, {
                timeout: options.waitForSelector
              })
            }
            ;[elem] = await page.$x(selector)
          } else {
            if (options?.waitForSelector !== undefined) {
              await page.waitForSelector(selector, {
                timeout: options.waitForSelector
              })
            }
            elem = await page.$(selector)
          }
          if (elem === null) {
            throw new Error(
              `Could not find element with selector "${selector}", make sure you're waiting for the elements with "puppeteer.waitForSelector"`
            )
          }
        } else {
          // ElementHandle
          elem = selector
        }

        // Make sure the object is in view
        const objectId = (elem as any).remoteObject()?.objectId
        if (objectId !== undefined) {
          try {
            await getCDPClient(page).send('DOM.scrollIntoViewIfNeeded', {
              objectId
            })
          } catch (e) {
            // use regular JS scroll method as a fallback
            console.debug('Falling back to JS scroll method', e)
            await elem.evaluate((e) => e.scrollIntoView({ block: 'center' }))
            await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait a bit until the scroll has finished
          }
        }
        const box = await boundingBoxWithFallback(page, elem)
        const { height, width } = box
        const destination = getRandomBoxPoint(box, options)
        const dimensions = { height, width }
        const overshooting = shouldOvershoot(previous, destination)
        const to = overshooting
          ? overshoot(destination, overshootRadius)
          : destination

        await tracePath(path(previous, to))

        if (overshooting) {
          const correction = path(
            to,
            { ...dimensions, ...destination },
            overshootSpread
          )

          await tracePath(correction)
        }

        previous = destination

        actions.toggleRandomMove(true)

        const newBoundingBox = await boundingBoxWithFallback(page, elem)

        // It's possible that the element that is being moved towards
        // has moved to a different location by the time
        // the the time the mouseover animation finishes
        if (!intersectsElement(to, newBoundingBox)) {
          return await go(iteration + 1)
        }
      }
      return await go(0)
    },
    async moveTo (destination: Vector): Promise<void> {
      actions.toggleRandomMove(false)
      await tracePath(path(previous, destination))
      actions.toggleRandomMove(true)
    }
  }

  // Start random mouse movements. Do not await the promise but return immediately
  if (performRandomMoves) {
    randomMove().then(
      (_) => {},
      (_) => {}
    )
  }

  return actions
}
