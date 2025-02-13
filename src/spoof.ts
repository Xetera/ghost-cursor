import type { ElementHandle, Page, BoundingBox, CDPSession, Protocol } from 'puppeteer'
import debug from 'debug'
import {
  type Vector,
  type TimedVector,
  bezierCurve,
  bezierCurveSpeed,
  direction,
  magnitude,
  origin,
  overshoot
} from './math'
export { default as installMouseHelper } from './mouse-helper'

const log = debug('ghost-cursor')

export interface BoxOptions {
  /**
   * Percentage of padding to be added inside the element.
   * Example:
   * - `0` = may be anywhere within the element.
   * - `100` = will always be center of element.
   * @default 0
   */
  readonly paddingPercentage?: number
}

export interface MoveOptions extends BoxOptions, Pick<PathOptions, 'moveSpeed'> {
  /**
   * Time to wait for the selector to appear in milliseconds.
   * Default is to not wait for selector.
   */
  readonly waitForSelector?: number
  /**
   * Delay after moving the mouse in milliseconds. If `randomizeMoveDelay=true`, delay is randomized from 0 to `moveDelay`.
   * @default 0
   */
  readonly moveDelay?: number
  /**
   * Randomize delay between actions from `0` to `moveDelay`. See `moveDelay` docs.
   * @default true
   */
  readonly randomizeMoveDelay?: boolean
  /**
   * Maximum number of attempts to mouse-over the element.
   * @default 10
   */
  readonly maxTries?: number
  /**
   * Distance from current location to destination that triggers overshoot to
   * occur. (Below this distance, no overshoot will occur).
   * @default 500
   */
  readonly overshootThreshold?: number
  /**
   * Scroll behavior when target element is outside the visible window.
   *
   * {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView#behavior}
   *
   * NOTE: If this is specified, will use JS scrolling instead of CDP scrolling, which is detectable!
   *
   * @default undefined (use CDP scrolling)
   */
  readonly scrollBehavior?: ScrollBehavior
  /**
   * Time to wait after scrolling (when scrolling occurs due to target element being outside the visible window)
   * @default 200
   */
  readonly scrollWait?: number
}

export interface ClickOptions extends MoveOptions {
  /**
   * Delay before initiating the click action in milliseconds.
   * @default 0
   */
  readonly hesitate?: number
  /**
   * Delay between mousedown and mouseup in milliseconds.
   * @default 0
   */
  readonly waitForClick?: number
  /**
   * @default 2000
   */
  readonly moveDelay?: number
}

export interface PathOptions {
  /**
   * Override the spread of the generated path.
   */
  readonly spreadOverride?: number
  /**
   * Speed of mouse movement.
   * Default is random.
   */
  readonly moveSpeed?: number

  /**
   * Generate timestamps for each point in the path.
   */
  readonly useTimestamps?: boolean
}

export interface RandomMoveOptions extends Pick<MoveOptions, 'moveDelay' | 'randomizeMoveDelay' | 'moveSpeed'> {
  /**
   * @default 2000
   */
  readonly moveDelay?: number
}

export interface MoveToOptions extends PathOptions, Pick<MoveOptions, 'moveDelay' | 'randomizeMoveDelay'> {
  /**
   * @default 0
   */
  readonly moveDelay?: number
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
  moveTo: (destination: Vector, options?: MoveToOptions) => Promise<void>
  getLocation: () => Vector
}

/** Helper function to wait a specified number of milliseconds  */
const delay = async (ms: number): Promise<void> => {
  if (ms < 1) return
  return await new Promise((resolve) => setTimeout(resolve, ms))
}

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

/** Get a random point on a box */
const getRandomBoxPoint = (
  { x, y, width, height }: BoundingBox,
  options?: BoxOptions
): Vector => {
  let paddingWidth = 0
  let paddingHeight = 0

  if (
    options?.paddingPercentage !== undefined &&
    options?.paddingPercentage > 0 &&
    options?.paddingPercentage <= 100
  ) {
    paddingWidth = (width * options.paddingPercentage) / 100
    paddingHeight = (height * options.paddingPercentage) / 100
  }

  return {
    x: x + paddingWidth / 2 + Math.random() * (width - paddingWidth),
    y: y + paddingHeight / 2 + Math.random() * (height - paddingHeight)
  }
}

/** The function signature to access the internal CDP client changed in puppeteer 14.4.1 */
const getCDPClient = (page: any): CDPSession => typeof page._client === 'function' ? page._client() : page._client

/** Get a random point on a browser window */
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

/** Using this method to get correct position of Inline elements (elements like `<a>`) */
const getElementBox = async (
  page: Page,
  element: ElementHandle,
  relativeToMainFrame: boolean = true
): Promise<BoundingBox | null> => {
  const objectId = element.remoteObject().objectId
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
      const elementFrame = await element.contentFrame()
      const iframes =
        elementFrame != null
          ? await elementFrame.parentFrame()?.$$('xpath/.//iframe')
          : null
      let frame: ElementHandle<Node> | undefined
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
    log('Quads not found, trying regular boundingBox')
    return await element.boundingBox()
  }
}

export function path (point: Vector, target: Vector, options?: number | PathOptions)
export function path (point: Vector, target: BoundingBox, options?: number | PathOptions)
export function path (start: Vector, end: BoundingBox | Vector, options?: number | PathOptions): Vector[] | TimedVector[] {
  const optionsResolved: PathOptions = typeof options === 'number'
    ? { spreadOverride: options }
    : { ...options }

  const DEFAULT_WIDTH = 100
  const MIN_STEPS = 25
  const width = 'width' in end && end.width !== 0 ? end.width : DEFAULT_WIDTH
  const curve = bezierCurve(start, end, optionsResolved.spreadOverride)
  const length = curve.length() * 0.8

  const speed = optionsResolved.moveSpeed !== undefined && optionsResolved.moveSpeed > 0
    ? (25 / optionsResolved.moveSpeed)
    : Math.random()
  const baseTime = speed * MIN_STEPS
  const steps = Math.ceil((Math.log2(fitts(length, width) + 1) + baseTime) * 3)
  const re = curve.getLUT(steps)
  return clampPositive(re, optionsResolved)
}

const clampPositive = (vectors: Vector[], options?: PathOptions): Vector[] | TimedVector[] => {
  const clampedVectors = vectors.map((vector) => ({
    x: Math.max(0, vector.x),
    y: Math.max(0, vector.y)
  }))

  return options?.useTimestamps === true ? generateTimestamps(clampedVectors, options) : clampedVectors
}

const generateTimestamps = (vectors: Vector[], options?: PathOptions): TimedVector[] => {
  const speed = options?.moveSpeed ?? (Math.random() * 0.5 + 0.5)
  const timeToMove = (P0: Vector, P1: Vector, P2: Vector, P3: Vector, samples: number): number => {
    let total = 0
    const dt = 1 / samples

    for (let t = 0; t < 1; t += dt) {
      const v1 = bezierCurveSpeed(t * dt, P0, P1, P2, P3)
      const v2 = bezierCurveSpeed(t, P0, P1, P2, P3)
      total += (v1 + v2) * dt / 2
    }

    return Math.round(total / speed)
  }

  const timedVectors: TimedVector[] = vectors.map((vector) => ({ ...vector, timestamp: 0 }))

  for (let i = 0; i < timedVectors.length; i++) {
    const P0 = i === 0 ? timedVectors[i] : timedVectors[i - 1]
    const P1 = timedVectors[i]
    const P2 = i === timedVectors.length - 1 ? timedVectors[i] : timedVectors[i + 1]
    const P3 = i === timedVectors.length - 1 ? timedVectors[i] : timedVectors[i + 1]
    const time = timeToMove(P0, P1, P2, P3, timedVectors.length)

    timedVectors[i] = {
      ...timedVectors[i],
      timestamp: i === 0 ? Date.now() : timedVectors[i - 1].timestamp + time
    }
  }

  return timedVectors
}

const shouldOvershoot = (a: Vector, b: Vector, threshold: number): boolean =>
  magnitude(direction(a, b)) > threshold

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
  /**
   * Cursor start position.
   * @default { x: 0, y: 0 }
   */
  start: Vector = origin,
  /**
   * Initially perform random movements.
   * If `move`,`click`, etc. is performed, these random movements end.
   * @default false
   */
  performRandomMoves: boolean = false,
  defaultOptions: {
    /**
     * Default options for the `randomMove` function that occurs when `performRandomMoves=true`
     * @default RandomMoveOptions
     */
    randomMove?: RandomMoveOptions
    /**
     * Default options for the `move` function
     * @default MoveOptions
     */
    move?: MoveOptions
    /**
     * Default options for the `moveTo` function
     * @default MoveToOptions
     */
    moveTo?: MoveToOptions
    /**
     * Default options for the `click` function
     * @default ClickOptions
     */
    click?: ClickOptions
  } = {}
): GhostCursor => {
  // this is kind of arbitrary, not a big fan but it seems to work
  const OVERSHOOT_SPREAD = 10
  const OVERSHOOT_RADIUS = 120
  let previous: Vector = start

  // Initial state: mouse is not moving
  let moving: boolean = false

  // Move the mouse over a number of vectors
  const tracePath = async (
    vectors: Iterable<Vector | TimedVector>,
    abortOnMove: boolean = false
  ): Promise<void> => {
    const cdpClient = getCDPClient(page)

    for (const v of vectors) {
      try {
        // In case this is called from random mouse movements and the users wants to move the mouse, abort
        if (abortOnMove && moving) {
          return
        }

        const dispatchParams: Protocol.Input.DispatchMouseEventRequest = {
          type: 'mouseMoved',
          x: v.x,
          y: v.y
        }

        if ('timestamp' in v) dispatchParams.timestamp = v.timestamp

        await cdpClient.send('Input.dispatchMouseEvent', dispatchParams)

        previous = v
      } catch (error) {
        // Exit function if the browser is no longer connected
        if (!page.browser().isConnected()) return

        log('Warning: could not move mouse, error message:', error)
      }
    }
  }
  // Start random mouse movements. Function recursively calls itself
  const randomMove = async (options?: RandomMoveOptions): Promise<void> => {
    const optionsResolved = {
      moveDelay: 2000,
      randomizeMoveDelay: true,
      ...defaultOptions?.randomMove,
      ...options
    } satisfies RandomMoveOptions

    try {
      if (!moving) {
        const rand = await getRandomPagePoint(page)
        await tracePath(path(previous, rand, optionsResolved), true)
        previous = rand
      }
      await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
      randomMove(options).then(
        (_) => { },
        (_) => { }
      ) // fire and forget, recursive function
    } catch (_) {
      log('Warning: stopping random mouse movements')
    }
  }

  const actions: GhostCursor = {
    toggleRandomMove (random: boolean): void {
      moving = !random
    },

    getLocation (): Vector {
      return previous
    },

    async click (
      selector?: string | ElementHandle,
      options?: ClickOptions
    ): Promise<void> {
      const optionsResolved = {
        moveDelay: 2000,
        hesitate: 0,
        waitForClick: 0,
        randomizeMoveDelay: true,
        ...defaultOptions?.click,
        ...options
      } satisfies ClickOptions

      const wasRandom = !moving
      actions.toggleRandomMove(false)

      if (selector !== undefined) {
        await actions.move(selector, {
          ...optionsResolved,
          // apply moveDelay after click, but not after actual move
          moveDelay: 0
        })
      }

      try {
        await delay(optionsResolved.hesitate)
        await page.mouse.down()
        await delay(optionsResolved.waitForClick)
        await page.mouse.up()
      } catch (error) {
        log('Warning: could not click mouse, error message:', error)
      }

      await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))

      actions.toggleRandomMove(wasRandom)
    },

    async move (
      selector: string | ElementHandle,
      options?: MoveOptions
    ): Promise<void> {
      const optionsResolved = {
        moveDelay: 0,
        maxTries: 10,
        overshootThreshold: 500,
        randomizeMoveDelay: true,
        scrollWait: 200,
        ...defaultOptions?.move,
        ...options
      } satisfies MoveOptions

      const wasRandom = !moving

      const go = async (iteration: number): Promise<void> => {
        if (iteration > (optionsResolved.maxTries)) {
          throw Error('Could not mouse-over element within enough tries')
        }

        actions.toggleRandomMove(false)
        let elem: ElementHandle<Element> | null = null
        if (typeof selector === 'string') {
          if (selector.startsWith('//') || selector.startsWith('(//')) {
            selector = `xpath/.${selector}`
            if (optionsResolved.waitForSelector !== undefined) {
              await page.waitForSelector(selector, {
                timeout: optionsResolved.waitForSelector
              })
            }
            const [handle] = await page.$$(selector)
            elem = handle.asElement() as ElementHandle<Element>
          } else {
            if (optionsResolved.waitForSelector !== undefined) {
              await page.waitForSelector(selector, {
                timeout: optionsResolved.waitForSelector
              })
            }
            elem = await page.$(selector)
          }
          if (elem === null) {
            throw new Error(
              `Could not find element with selector "${selector}", make sure you're waiting for the elements by specifying "waitForSelector"`
            )
          }
        } else {
          // ElementHandle
          elem = selector
        }

        // Make sure the object is in view
        if (!(await elem.isIntersectingViewport())) {
          const scrollElemIntoView = async (): Promise<void> =>
            await elem.evaluate((e, scrollBehavior) => e.scrollIntoView({
              block: 'center',
              behavior: scrollBehavior
            }), optionsResolved.scrollBehavior)

          if (optionsResolved.scrollBehavior !== undefined) {
            // DOM.scrollIntoViewIfNeeded is instant scroll, so do the JS scroll if scrollBehavior passed
            await scrollElemIntoView()
          } else {
            try {
              const { objectId } = elem.remoteObject()
              if (objectId === undefined) throw new Error()
              await getCDPClient(page).send('DOM.scrollIntoViewIfNeeded', {
                objectId
              })
            } catch (e) {
            // use regular JS scroll method as a fallback
              log('Falling back to JS scroll method', e)
              await scrollElemIntoView()
            }
          }
          await delay(optionsResolved.scrollWait)
        }

        const box = await boundingBoxWithFallback(page, elem)
        const { height, width } = box
        const destination = getRandomBoxPoint(box, optionsResolved)
        const dimensions = { height, width }
        const overshooting = shouldOvershoot(
          previous,
          destination,
          optionsResolved.overshootThreshold
        )
        const to = overshooting
          ? overshoot(destination, OVERSHOOT_RADIUS)
          : destination

        await tracePath(path(previous, to, optionsResolved))

        if (overshooting) {
          const correction = path(to, { ...dimensions, ...destination }, {
            ...optionsResolved,
            spreadOverride: OVERSHOOT_SPREAD
          })

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
      await go(0)

      actions.toggleRandomMove(wasRandom)

      await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
    },

    async moveTo (destination: Vector, options?: MoveToOptions): Promise<void> {
      const optionsResolved = {
        moveDelay: 0,
        randomizeMoveDelay: true,
        ...defaultOptions?.moveTo,
        ...options
      } satisfies MoveToOptions

      const wasRandom = !moving
      actions.toggleRandomMove(false)
      await tracePath(path(previous, destination, optionsResolved))
      actions.toggleRandomMove(wasRandom)

      await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
    }
  }

  // Start random mouse movements. Do not await the promise but return immediately
  if (performRandomMoves) {
    randomMove().then(
      (_) => { },
      (_) => { }
    )
  }

  return actions
}
