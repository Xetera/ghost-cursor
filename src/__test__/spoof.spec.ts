import type { ElementHandle, Page } from 'puppeteer'
import { type ClickOptions, GhostCursor } from '../spoof'
import { join } from 'path'
import { readFileSync } from 'fs'
import installMouseHelper from '../mouse-helper'

declare const page: Page

let cursor: GhostCursor

const cursorDefaultOptions = {
  moveDelay: 0,
  moveSpeed: 99,
  hesitate: 0,
  waitForClick: 0,
  scrollDelay: 0,
  scrollSpeed: 99,
  inViewportMargin: 50
} as const satisfies ClickOptions

declare global {
  // eslint-disable-next-line no-var
  var boxWasClicked: boolean
}

describe('Mouse movements', () => {
  const html = readFileSync(join(__dirname, 'custom-page.html'), 'utf8')

  beforeAll(async () => {
    await installMouseHelper(page)
  })

  beforeEach(async () => {
    await page.goto('data:text/html,' + encodeURIComponent(html), {
      waitUntil: 'networkidle2'
    })

    cursor = new GhostCursor(page, {
      defaultOptions: {
        move: cursorDefaultOptions,
        click: cursorDefaultOptions,
        moveTo: cursorDefaultOptions
      }
    })
  })

  const testClick = async (clickSelector: string): Promise<void> => {
    expect(await page.evaluate(() => window.boxWasClicked)).toEqual(false)
    await cursor.click(clickSelector)
    expect(await page.evaluate(() => window.boxWasClicked)).toEqual(true)
  }

  const getScrollPosition = async (): Promise<{ top: number, left: number }> => await page.evaluate(() => (
    { top: window.scrollY, left: window.scrollX }
  ))

  it('Should click on the element without throwing an error (CSS selector)', async () => {
    await testClick('#box1')
  })

  it('Should click on the element without throwing an error (XPath selector)', async () => {
    await testClick('//*[@id="box1"]')
  })

  it('Should scroll to elements correctly', async () => {
    const boxes = await Promise.all([1, 2, 3].map(async (number: number): Promise<ElementHandle<HTMLElement>> => {
      const selector = `#box${number}`
      const box = await page.waitForSelector(selector) as ElementHandle<HTMLElement> | null
      if (box == null) throw new Error(`${selector} not found`)
      return box
    }))

    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })

    expect(await boxes[0].isIntersectingViewport()).toBeTruthy()
    await cursor.click(boxes[0])
    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })
    expect(await boxes[0].isIntersectingViewport()).toBeTruthy()

    expect(await boxes[1].isIntersectingViewport()).toBeFalsy()
    await cursor.move(boxes[1])
    expect(await getScrollPosition()).toEqual({ top: 2500, left: 0 })
    expect(await boxes[1].isIntersectingViewport()).toBeTruthy()

    expect(await boxes[2].isIntersectingViewport()).toBeFalsy()
    await cursor.move(boxes[2])
    expect(await getScrollPosition()).toEqual({ top: 4450, left: 2250 })
    expect(await boxes[2].isIntersectingViewport()).toBeTruthy()

    expect(await boxes[0].isIntersectingViewport()).toBeFalsy()
    await cursor.click(boxes[0])
    expect(await boxes[0].isIntersectingViewport()).toBeTruthy()
  })

  it('Should scroll to position correctly', async () => {
    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })

    await cursor.scrollTo('bottom')
    expect(await getScrollPosition()).toEqual({ top: 4450, left: 0 })

    await cursor.scrollTo('right')
    expect(await getScrollPosition()).toEqual({ top: 4450, left: 2250 })

    await cursor.scrollTo('top')
    expect(await getScrollPosition()).toEqual({ top: 0, left: 2250 })

    await cursor.scrollTo('left')
    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })

    await cursor.scrollTo({ y: 200, x: 400 })
    expect(await getScrollPosition()).toEqual({ top: 200, left: 400 })
  })
})

jest.setTimeout(15_000)
