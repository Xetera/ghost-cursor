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
  overshoot,
  add,
  clamp,
  scale,
  extrapolate
} from './math'
import { installMouseHelper } from './mouse-helper'

export { installMouseHelper }

const log = debug('ghost-cursor')

export interface BoxOptions {
  /**
   * Percentage of padding to be added inside the element when determining the target point.
   * Example:
   * - `0` = may be anywhere within the element.
   * - `100` = will always be center of element.
   * @default 0
   */
  readonly paddingPercentage?: number
  /**
   * Destination to move the cursor to, relative to the top-left corner of the element.
   * If specified, `paddingPercentage` is not used.
   * If not specified (default), destination is random point within the `paddingPercentage`.
   * @default undefined (random point)
   */
  readonly destination?: Vector
}

export interface GetElementOptions {
  /**
   * Time to wait for the selector to appear in milliseconds.
   * Default is to not wait for selector.
   */
  readonly waitForSelector?: number
}

export interface ScrollOptions {
  /**
   * Scroll speed. 0 to 100. 100 is instant.
   * @default 100
   */
  readonly scrollSpeed?: number
  /**
   * Time to wait after scrolling.
   * @default 200
   */
  readonly scrollDelay?: number
}

export interface ScrollIntoViewOptions extends ScrollOptions, GetElementOptions {
  /**
   * Scroll speed (when scrolling occurs). 0 to 100. 100 is instant.
   * @default 100
   */
  readonly scrollSpeed?: number
  /**
   * Time to wait after scrolling (when scrolling occurs).
   * @default 200
   */
  readonly scrollDelay?: number
  /**
   * Margin (in px) to add around the element when ensuring it is in the viewport.
   * (Does not take effect if CDP scroll fails.)
   * @default 0
   */
  readonly inViewportMargin?: number
}

export interface MoveOptions extends BoxOptions, ScrollIntoViewOptions, Pick<PathOptions, 'moveSpeed'> {
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
  /**
   * @default "left"
   */
  readonly button?: Protocol.Input.MouseButton
  /**
   * @default 1
   */
  readonly clickCount?: number
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

export type ScrollToDestination = Partial<Vector> | 'top' | 'bottom' | 'left' | 'right'

export type MouseButtonOptions = Pick<ClickOptions, 'button' | 'clickCount'>

/**
 * Default options for cursor functions.
 */
export interface DefaultOptions {
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
  /**
  * Default options for the `scrollIntoView`, `scrollTo`, and `scroll` functions
  * @default ScrollIntoViewOptions
  */
  scroll?: ScrollOptions & ScrollIntoViewOptions
  /**
   * Default options for the `getElement` function
   * @default GetElementOptions
   */
  getElement?: GetElementOptions
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
  options?: Pick<BoxOptions, 'paddingPercentage'>
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
export const getCDPClient = (page: Page): CDPSession =>
  typeof (page as any)._client === 'function'
    ? (page as any)._client()
    : (page as any)._client

/** Get a random point on a browser window */
export const getRandomPagePoint = async (page: Page): Promise<Vector> => {
  const targetId: string = (page.target() as any)._targetId
  const window = await getCDPClient(page).send('Browser.getWindowForTarget', { targetId })
  return getRandomBoxPoint({
    x: origin.x,
    y: origin.y,
    width: window.bounds.width ?? 0,
    height: window.bounds.height ?? 0
  })
}

/** Get correct position of Inline elements (elements like `<a>`). Has fallback. */
export const getElementBox = async (
  page: Page,
  element: ElementHandle,
  relativeToMainFrame: boolean = true): Promise<BoundingBox> => {
  try {
    const objectId = element.remoteObject().objectId
    if (objectId === undefined) throw new Error('Element objectId is undefined, falling back to alternative methods')

    const quads = await getCDPClient(page).send('DOM.getContentQuads', { objectId })
    const elementBox: BoundingBox = {
      x: quads.quads[0][0],
      y: quads.quads[0][1],
      width: quads.quads[0][4] - quads.quads[0][0],
      height: quads.quads[0][5] - quads.quads[0][1]
    }
    if (!relativeToMainFrame) {
      const elementFrame = await element.contentFrame()
      const iframes = await elementFrame?.parentFrame()?.$$('xpath/.//iframe')
      if (iframes !== undefined && iframes !== null) {
        let frame: ElementHandle<Node> | undefined
        for (const iframe of iframes) {
          if ((await iframe.contentFrame()) === elementFrame) {
            frame = iframe
          }
        }
        if (frame !== undefined && frame != null) {
          const frameBox = await frame.boundingBox()
          if (frameBox !== null) {
            elementBox.x -= frameBox.x
            elementBox.y -= frameBox.y
          }
        }
      }
    }

    return elementBox
  } catch {
    try {
      log('Quads not found, trying regular boundingBox')
      const elementBox = await element.boundingBox()
      if (elementBox === null) throw new Error('Element boundingBox is null, falling back to getBoundingClientRect')
      return elementBox
    } catch {
      log('BoundingBox null, using getBoundingClientRect')
      return await element.evaluate((el) =>
        el.getBoundingClientRect() as BoundingBox
      )
    }
  }
}

/** Generates a set of points for mouse movement between two coordinates. */
export function path (
  start: Vector,
  end: Vector | BoundingBox,
  /**
   * Additional options for generating the path.
   * Can also be a number which will set `spreadOverride`.
   */
  // TODO: remove number arg in next major version change, fine to just allow `spreadOverride` in object.
  options?: number | PathOptions): Vector[] | TimedVector[] {
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

  const timedVectors: TimedVector[] = []

  for (let i = 0; i < vectors.length; i++) {
    if (i === 0) {
      timedVectors.push({ ...vectors[i], timestamp: Date.now() })
    } else {
      const P0 = vectors[i - 1]
      const P1 = vectors[i]
      const P2 = i + 1 < vectors.length ? vectors[i + 1] : extrapolate(P0, P1)
      const P3 = i + 2 < vectors.length ? vectors[i + 2] : extrapolate(P1, P2)
      const time = timeToMove(P0, P1, P2, P3, vectors.length)

      timedVectors.push({
        ...vectors[i],
        timestamp: timedVectors[i - 1].timestamp + time
      })
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

export class GhostCursor {
  readonly page: Page
  /**
   * Initially perform random movements.
   * If `move`,`click`, etc. is performed, these random movements end.
   * @default false
   */
  public performRandomMoves: boolean
  /**
   * Default options for cursor functions.
   */
  public defaultOptions: DefaultOptions
  /**
   * Make the cursor no longer visible.
   * Defined only if `visible=true` was passed.
   */
  public removeMouseHelper: undefined | Promise<() => Promise<void>>

  /** Location of the cursor. */
  private location: Vector
  /** Whether mouse is moving. Initial state: not moving. */
  private moving: boolean = false

  private static readonly OVERSHOOT_SPREAD = 10
  private static readonly OVERSHOOT_RADIUS = 120

  constructor (
    page: Page, {
      start = origin,
      performRandomMoves = false,
      defaultOptions = {},
      visible = false
    }:
    {
      /**
           * Cursor start position.
           * @default { x: 0, y: 0 }
           */
      start?: Vector
      /**
           * Initially perform random movements.
           * If `move`,`click`, etc. is performed, these random movements end.
           * @default false
           */
      performRandomMoves?: boolean
      /**
           * Set custom default options for cursor action functions.
           * Default values are described in the type JSdocs.
           */
      defaultOptions?: DefaultOptions
      /**
           * Whether cursor should be made visible using `installMouseHelper`.
           * @default false
           */
      visible?: boolean
    } = {}
  ) {
    this.page = page
    this.location = start
    this.performRandomMoves = performRandomMoves
    this.defaultOptions = defaultOptions

    if (visible) {
      // Install mouse helper (visible mouse). Do not await the promise but return immediately
      this.removeMouseHelper = installMouseHelper(page).then(
        ({ removeMouseHelper }) => removeMouseHelper)
    }

    // Start random mouse movements. Do not await the promise but return immediately
    if (performRandomMoves) {
      this.randomMove().then(
        (_) => { },
        (_) => { }
      )
    }
  }

  /** Move the mouse to a point, getting the vectors via `path(previous, newLocation, options)`  */
  private async moveMouse (
    newLocation: BoundingBox | Vector,
    options?: PathOptions,
    abortOnMove: boolean = false
  ): Promise<void> {
    const cdpClient = getCDPClient(this.page)
    const vectors = path(this.location, newLocation, options)

    for (const v of vectors) {
      try {
        // In case this is called from random mouse movements and the users wants to move the mouse, abort
        if (abortOnMove && this.moving) {
          return
        }

        const dispatchParams: Protocol.Input.DispatchMouseEventRequest = {
          type: 'mouseMoved',
          x: v.x,
          y: v.y
        }

        if ('timestamp' in v) dispatchParams.timestamp = v.timestamp

        await cdpClient.send('Input.dispatchMouseEvent', dispatchParams)

        this.location = v
      } catch (error) {
        // Exit function if the browser is no longer connected
        if (!this.page.browser().isConnected()) return

        log('Warning: could not move mouse, error message:', error)
      }
    }
  }

  /** Start random mouse movements. Function recursively calls itself. */
  private async randomMove (options?: RandomMoveOptions): Promise<void> {
    const optionsResolved = {
      moveDelay: 2000,
      randomizeMoveDelay: true,
      ...this.defaultOptions?.randomMove,
      ...options
    } satisfies RandomMoveOptions

    try {
      if (!this.moving) {
        const rand = await getRandomPagePoint(this.page)
        await this.moveMouse(rand, optionsResolved, true)
      }
      await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
      this.randomMove(options).then(
        (_) => { },
        (_) => { }
      ) // fire and forget, recursive function
    } catch (_) {
      log('Warning: stopping random mouse movements')
    }
  }

  private async mouseButtonAction (
    action: Protocol.Input.DispatchMouseEventRequest['type'],
    options?: MouseButtonOptions
  ): Promise<void> {
    const optionsResolved = {
      button: 'left',
      clickCount: 1,
      ...this.defaultOptions?.click,
      ...options
    } satisfies MouseButtonOptions

    const cdpClient = getCDPClient(this.page)
    await cdpClient.send('Input.dispatchMouseEvent', {
      x: this.location.x,
      y: this.location.y,
      button: optionsResolved.button,
      clickCount: optionsResolved.clickCount,
      type: action
    })
  }

  /** Mouse button down */
  async mouseDown (options?: MouseButtonOptions): Promise<void> {
    await this.mouseButtonAction('mousePressed', options)
  }

  /** Mouse button up (release) */
  async mouseUp (options?: MouseButtonOptions): Promise<void> {
    await this.mouseButtonAction('mouseReleased', options)
  }

  /** Toggles random mouse movements on or off. */
  public toggleRandomMove (random: boolean): void {
    this.moving = !random
  }

  /** Get current location of the cursor. */
  public getLocation (): Vector {
    return this.location
  }

  /**
   * Simulates a mouse click at the specified selector or element.
   * Default is to click at current location, don't move.
   */
  public async click (
    selector?: string | ElementHandle,
    /** @default defaultOptions.click */
    options?: ClickOptions
  ): Promise<void> {
    const optionsResolved = {
      moveDelay: 2000,
      hesitate: 0,
      waitForClick: 0,
      randomizeMoveDelay: true,
      button: 'left',
      clickCount: 1,
      ...this.defaultOptions?.click,
      ...options
    } satisfies ClickOptions

    const wasRandom = !this.moving
    this.toggleRandomMove(false)

    if (selector !== undefined) {
      await this.move(selector, {
        ...optionsResolved,
        // apply moveDelay after click, but not after actual move
        moveDelay: 0
      })
    }

    try {
      await delay(optionsResolved.hesitate)

      await this.mouseDown()
      await delay(optionsResolved.waitForClick)
      await this.mouseUp()
    } catch (error) {
      log('Warning: could not click mouse, error message:', error)
    }

    await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))

    this.toggleRandomMove(wasRandom)
  }

  /** Moves the mouse to the specified selector or element. */
  public async move (
    selector: string | ElementHandle,
    /** @default defaultOptions.move */
    options?: MoveOptions
  ): Promise<void> {
    const optionsResolved = {
      moveDelay: 0,
      maxTries: 10,
      overshootThreshold: 500,
      randomizeMoveDelay: true,
      ...this.defaultOptions?.move,
      ...options
    } satisfies MoveOptions

    const wasRandom = !this.moving
    this.toggleRandomMove(false)

    const go = async (iteration: number): Promise<void> => {
      if (iteration > (optionsResolved.maxTries)) {
        throw Error('Could not mouse-over element within enough tries')
      }

      const elem = await this.getElement(selector, optionsResolved)

      // Make sure the object is in view
      await this.scrollIntoView(elem, optionsResolved)

      const box = await getElementBox(this.page, elem)
      const destination = (optionsResolved.destination !== undefined)
        ? add(box, optionsResolved.destination)
        : getRandomBoxPoint(box, optionsResolved)
      if (shouldOvershoot(
        this.location,
        destination,
        optionsResolved.overshootThreshold
      )) {
        // overshoot
        await this.moveMouse(overshoot(destination, GhostCursor.OVERSHOOT_RADIUS), optionsResolved)

        // then go to the box
        await this.moveMouse({ ...box, ...destination }, {
          ...optionsResolved,
          spreadOverride: GhostCursor.OVERSHOOT_SPREAD
        })
      } else {
        // go directly to the box, no overshoot
        await this.moveMouse(destination, optionsResolved)
      }

      const newBoundingBox = await getElementBox(this.page, elem)

      // It's possible that the element that is being moved towards
      // has moved to a different location by the time
      // the the time the mouseover animation finishes
      if (!intersectsElement(this.location, newBoundingBox)) {
        return await go(iteration + 1)
      }
    }
    await go(0)

    this.toggleRandomMove(wasRandom)

    await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
  }

  /** Moves the mouse to the specified destination point. */
  public async moveTo (
    destination: Vector,
    /** @default defaultOptions.moveTo */
    options?: MoveToOptions
  ): Promise<void> {
    const optionsResolved = {
      moveDelay: 0,
      randomizeMoveDelay: true,
      ...this.defaultOptions?.moveTo,
      ...options
    } satisfies MoveToOptions

    const wasRandom = !this.moving
    this.toggleRandomMove(false)
    await this.moveMouse(destination, optionsResolved)
    this.toggleRandomMove(wasRandom)

    await delay(optionsResolved.moveDelay * (optionsResolved.randomizeMoveDelay ? Math.random() : 1))
  }

  /** Moves the mouse by a specified amount */
  public async moveBy (delta: Partial<Vector>, options?: MoveToOptions): Promise<void> {
    await this.moveTo(add(this.location, { x: 0, y: 0, ...delta }), options)
  }

  /** Scrolls the element into view. If already in view, no scroll occurs. */
  public async scrollIntoView (
    selector: string | ElementHandle,
    /** @default defaultOptions.scroll */
    options?: ScrollIntoViewOptions
  ): Promise<void> {
    const optionsResolved = {
      scrollDelay: 200,
      scrollSpeed: 100,
      inViewportMargin: 0,
      ...this.defaultOptions?.scroll,
      ...options
    } satisfies ScrollIntoViewOptions

    const scrollSpeed = clamp(optionsResolved.scrollSpeed, 1, 100)

    const elem = await this.getElement(selector, optionsResolved)

    const {
      viewportWidth,
      viewportHeight,
      docHeight,
      docWidth,
      scrollPositionTop,
      scrollPositionLeft
    } = await this.page.evaluate(() => (
      {
        viewportWidth: document.body.clientWidth,
        viewportHeight: document.body.clientHeight,
        docHeight: document.body.scrollHeight,
        docWidth: document.body.scrollWidth,
        scrollPositionTop: window.scrollY,
        scrollPositionLeft: window.scrollX
      }
    ))

    const elemBoundingBox = await getElementBox(this.page, elem) // is relative to viewport
    const elemBox = {
      top: elemBoundingBox.y,
      left: elemBoundingBox.x,
      bottom: elemBoundingBox.y + elemBoundingBox.height,
      right: elemBoundingBox.x + elemBoundingBox.width
    }

    // Add margin around the element
    const marginedBox = {
      top: elemBox.top - optionsResolved.inViewportMargin,
      left: elemBox.left - optionsResolved.inViewportMargin,
      bottom: elemBox.bottom + optionsResolved.inViewportMargin,
      right: elemBox.right + optionsResolved.inViewportMargin
    }

    // Get position relative to the whole document
    const marginedBoxRelativeToDoc = {
      top: marginedBox.top + scrollPositionTop,
      left: marginedBox.left + scrollPositionLeft,
      bottom: marginedBox.bottom + scrollPositionTop,
      right: marginedBox.right + scrollPositionLeft
    }

    // Convert back to being relative to the viewport-- though if box with margin added goes outside
    // the document, restrict to being *within* the document.
    // This makes it so that when element is on the edge of window scroll, isInViewport=true even after
    // margin was added.
    const targetBox = {
      top: Math.max(marginedBoxRelativeToDoc.top, 0) - scrollPositionTop,
      left: Math.max(marginedBoxRelativeToDoc.left, 0) - scrollPositionLeft,
      bottom: Math.min(marginedBoxRelativeToDoc.bottom, docHeight) - scrollPositionTop,
      right: Math.min(marginedBoxRelativeToDoc.right, docWidth) - scrollPositionLeft
    }

    const { top, left, bottom, right } = targetBox

    const isInViewport = top >= 0 &&
      left >= 0 &&
      bottom <= viewportHeight &&
      right <= viewportWidth

    if (isInViewport) return

    const manuallyScroll = async (): Promise<void> => {
      let deltaY: number = 0
      let deltaX: number = 0

      if (top < 0) {
        deltaY = top // Scroll up
      } else if (bottom > viewportHeight) {
        deltaY = bottom - viewportHeight // Scroll down
      }

      if (left < 0) {
        deltaX = left // Scroll left
      } else if (right > viewportWidth) {
        deltaX = right - viewportWidth// Scroll right
      }

      await this.scroll({ x: deltaX, y: deltaY }, optionsResolved)
    }

    try {
      const cdpClient = getCDPClient(this.page)

      if (scrollSpeed === 100 && optionsResolved.inViewportMargin <= 0) {
        try {
          const { objectId } = elem.remoteObject()
          if (objectId === undefined) throw new Error()
          await cdpClient.send('DOM.scrollIntoViewIfNeeded', { objectId })
        } catch {
          await manuallyScroll()
        }
      } else {
        await manuallyScroll()
      }
    } catch (e) {
      // use regular JS scroll method as a fallback
      log('Falling back to JS scroll method', e)
      await elem.evaluate((e) => e.scrollIntoView({
        block: 'center',
        behavior: scrollSpeed < 90 ? 'smooth' : undefined
      }))
    }
  }

  /** Scrolls the page the distance set by `delta`. */
  public async scroll (
    delta: Partial<Vector>,
    /** @default defaultOptions.scroll */
    options?: ScrollOptions
  ): Promise<void> {
    const optionsResolved = {
      scrollDelay: 200,
      scrollSpeed: 100,
      ...this.defaultOptions?.scroll,
      ...options
    } satisfies ScrollOptions

    const scrollSpeed = clamp(optionsResolved.scrollSpeed, 1, 100)

    const cdpClient = getCDPClient(this.page)

    let deltaX = delta.x ?? 0
    let deltaY = delta.y ?? 0
    const xDirection = deltaX < 0 ? -1 : 1
    const yDirection = deltaY < 0 ? -1 : 1

    deltaX = Math.abs(deltaX)
    deltaY = Math.abs(deltaY)

    const largerDistanceDir = deltaX > deltaY ? 'x' : 'y'
    const [largerDistance, shorterDistance] = largerDistanceDir === 'x' ? [deltaX, deltaY] : [deltaY, deltaX]

    // When scrollSpeed under 90, pixels moved each scroll is equal to the scrollSpeed. 1 is as slow as we can get (without adding a delay), and 90 is pretty fast.
    // Above 90 though, scale all the way to the full distance so that scrollSpeed=100 results in only 1 scroll action.
    const EXP_SCALE_START = 90
    const largerDistanceScrollStep = scrollSpeed < EXP_SCALE_START
      ? scrollSpeed
      : scale(scrollSpeed, [EXP_SCALE_START, 100], [EXP_SCALE_START, largerDistance])

    const numSteps = Math.floor(largerDistance / largerDistanceScrollStep)
    const largerDistanceRemainder = largerDistance % largerDistanceScrollStep
    const shorterDistanceScrollStep = Math.floor(shorterDistance / numSteps)
    const shorterDistanceRemainder = shorterDistance % numSteps

    for (let i = 0; i < numSteps; i++) {
      let longerDistanceDelta = largerDistanceScrollStep
      let shorterDistanceDelta = shorterDistanceScrollStep
      if (i === numSteps - 1) {
        longerDistanceDelta += largerDistanceRemainder
        shorterDistanceDelta += shorterDistanceRemainder
      }
      let [deltaX, deltaY] = largerDistanceDir === 'x'
        ? [longerDistanceDelta, shorterDistanceDelta]
        : [shorterDistanceDelta, longerDistanceDelta]
      deltaX = deltaX * xDirection
      deltaY = deltaY * yDirection

      await cdpClient.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        deltaX,
        deltaY,
        x: this.location.x,
        y: this.location.y
      } satisfies Protocol.Input.DispatchMouseEventRequest)
    }

    await delay(optionsResolved.scrollDelay)
  }

  /** Scrolls to the specified destination point. */
  public async scrollTo (
    destination: ScrollToDestination,
    /** @default defaultOptions.scroll */
    options?: ScrollOptions
  ): Promise<void> {
    const optionsResolved = {
      scrollDelay: 200,
      scrollSpeed: 100,
      ...this.defaultOptions?.scroll,
      ...options
    } satisfies ScrollOptions

    const {
      docHeight,
      docWidth,
      scrollPositionTop,
      scrollPositionLeft
    } = await this.page.evaluate(() => (
      {
        docHeight: document.body.scrollHeight,
        docWidth: document.body.scrollWidth,
        scrollPositionTop: window.scrollY,
        scrollPositionLeft: window.scrollX
      }
    ))

    const to = ((): Partial<Vector> => {
      switch (destination) {
        case 'top':
          return { y: 0 }
        case 'bottom':
          return { y: docHeight }
        case 'left':
          return { x: 0 }
        case 'right':
          return { x: docWidth }
        default:
          return destination
      }
    })()

    await this.scroll({
      y: to.y !== undefined ? to.y - scrollPositionTop : 0,
      x: to.x !== undefined ? to.x - scrollPositionLeft : 0
    }, optionsResolved)
  }

  /** Gets the element via a selector. Can use an XPath. */
  public async getElement (
    selector: string | ElementHandle,
    /** @default defaultOptions.getElement */
    options?: GetElementOptions
  ): Promise<ElementHandle<Element>> {
    const optionsResolved = {
      ...this.defaultOptions?.getElement,
      ...options
    } satisfies GetElementOptions

    let elem: ElementHandle<Element> | null = null
    if (typeof selector === 'string') {
      if (selector.startsWith('//') || selector.startsWith('(//')) {
        selector = `xpath/.${selector}`
        if (optionsResolved.waitForSelector !== undefined) {
          await this.page.waitForSelector(selector, { timeout: optionsResolved.waitForSelector })
        }
        const [handle] = await this.page.$$(selector)
        elem = handle.asElement() as ElementHandle<Element> | null
      } else {
        if (optionsResolved.waitForSelector !== undefined) {
          await this.page.waitForSelector(selector, { timeout: optionsResolved.waitForSelector })
        }
        elem = await this.page.$(selector)
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
    return elem
  }
}

/**
 * @deprecated
 * TODO: Remove on next major version change. Prefer to just do `new GhostCursor` instead of this function.
 * Is here because removing would be breaking.
 */
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
  /**
   * Default options for cursor functions.
   */
  defaultOptions: DefaultOptions = {},
  /**
   * Whether cursor should be made visible using `installMouseHelper`.
   * @default false
   */
  visible: boolean = false
): GhostCursor => new GhostCursor(page, { start, performRandomMoves, defaultOptions, visible })
