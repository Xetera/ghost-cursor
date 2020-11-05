import { Page } from 'puppeteer'
import { Vector, bezierCurve, direction, magnitude, origin, overshoot } from './math'

interface BoxOptions { readonly paddingPercentage: number }
interface MoveOptions extends BoxOptions { readonly waitForSelector: number }
interface ClickOptions extends MoveOptions { readonly waitForClick: number }

const delay = async (ms): Promise<void> => await new Promise(resolve => setTimeout(resolve, ms))

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

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const getRandomBoxPoint = ({ x, y, width, height }: Box, options?: BoxOptions): Vector => {
  let paddingWidth = 0; let paddingHeight = 0

  if (options?.paddingPercentage !== undefined && options?.paddingPercentage > 0 && options?.paddingPercentage < 100) {
    paddingWidth = width * options.paddingPercentage / 100
    paddingHeight = height * options.paddingPercentage / 100
  }

  return {
    x: x + (paddingWidth / 2) + Math.random() * (width - paddingWidth),
    y: y + (paddingHeight / 2) + Math.random() * (height - paddingWidth)
  }
}

export const getRandomPagePoint = async (page: Page): Promise<Vector> => {
  const targetId: string = (page.target() as any)._targetId
  const window = await (page as any)._client.send('Browser.getWindowForTarget', { targetId })
  return getRandomBoxPoint({ x: origin.x, y: origin.y, width: window.bounds.width, height: window.bounds.height })
}

const isBox = (a: any): a is Box => 'width' in a

export function path (point: Vector, target: Vector, spreadOverride?: number)
export function path (point: Vector, target: Box, spreadOverride?: number)
export function path (start: Vector, end: Box | Vector, spreadOverride?: number): Vector[] {
  const defaultWidth = 100
  const minSteps = 25
  const width = isBox(end) ? end.width : defaultWidth
  const curve = bezierCurve(start, end, spreadOverride)
  const length = curve.length() * 0.8
  const baseTime = Math.random() * minSteps
  const steps = Math.ceil((Math.log2(fitts(length, width) + 1) + baseTime) * 3)
  const re = curve.getLUT(steps)
  return clampPositive(re)
}

const clampPositive = (vectors: Vector[]): Vector[] => {
  const clamp0 = (elem: number): number => Math.max(0, elem)
  return vectors.map(vector => {
    return {
      x: clamp0(vector.x),
      y: clamp0(vector.y)
    }
  })
}

const overshootThreshold = 500
const shouldOvershoot = (a: Vector, b: Vector): boolean => magnitude(direction(a, b)) > overshootThreshold

export const createCursor = (page: Page, start: Vector = origin): unknown => {
  // this is kind of arbitrary, not a big fan but it seems to work
  const overshootSpread = 10
  const overshootRadius = 50
  let previous: Vector = start
  const tracePath = async (vectors: Iterable<Vector>): Promise<void> => {
    for (const { x, y } of vectors) {
      await page.mouse.move(x, y)
    }
  }
  const actions = {
    async click (selector?: string, options?: ClickOptions): Promise<void> {
      if (selector !== undefined) {
        await actions.move(selector, options)
      }
      await page.mouse.down()
      if (options?.waitForClick !== undefined) {
        await delay(options.waitForClick)
      }
      await page.mouse.up()
    },
    async move (selector: string, options?: MoveOptions) {
      if (options?.waitForSelector !== undefined) {
        await page.waitForSelector(selector, {
          timeout: options.waitForSelector
        })
      }

      const elem = await page.$(selector)
      if (elem === null) {
        throw new Error(
          `Could not find element with selector "${selector}", make sure you're waiting for the elements with "puppeteer.waitForSelector"`
        )
      }
      // Make sure the object is in view
      if ((elem as any)._remoteObject.objectId !== null) {
        await (page as any)._client.send('DOM.scrollIntoViewIfNeeded', {
          objectId: (elem as any)._remoteObject.objectId
        })
      }
      const box = await elem.boundingBox()
      if (box === null) {
        throw new Error("Could not find the dimensions of the element you're clicking on, this might be a bug?")
      }
      const { height, width } = box
      const destination = getRandomBoxPoint(box, options)
      const dimensions = { height, width }
      const overshooting = shouldOvershoot(previous, destination)
      const to = overshooting ? overshoot(destination, overshootRadius) : destination
      await tracePath(path(previous, to))

      if (overshooting) {
        const correction = path(to, { ...dimensions, ...destination }, overshootSpread)

        await tracePath(correction)
      }
      previous = destination
    },
    async moveTo (destination: Vector) {
      await tracePath(path(previous, destination))
      previous = destination
    }
  }
  return actions
}
