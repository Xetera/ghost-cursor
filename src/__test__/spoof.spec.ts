import type { Page } from 'puppeteer'
import { type ClickOptions, createCursor, GhostCursor } from '../spoof'
import { join } from 'path'
import { promises as fs } from 'fs'
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

describe('Mouse movements', () => {
  beforeAll(async () => {
    await installMouseHelper(page)
    const html = await fs.readFile(join(__dirname, 'custom-page.html'), 'utf8')
    await page.goto('data:text/html,' + encodeURIComponent(html), {
      waitUntil: 'networkidle2'
    })
  })

  beforeEach(() => {
    cursor = createCursor(page, undefined, undefined, {
      move: cursorDefaultOptions,
      click: cursorDefaultOptions,
      moveTo: cursorDefaultOptions
    })
  })

  it('Should click on the element without throwing an error (CSS selector)', async () => {
    await cursor.click('#box1')
  })

  it('Should click on the element without throwing an error (XPath selector)', async () => {
    await cursor.click('//*[@id="box1"]')
  })

  it('Should scroll to elements correctly', async () => {
    const getScrollPosition = async (): Promise<{ top: number, left: number }> => await page.evaluate(() => (
      { top: window.scrollY, left: window.scrollX }
    ))

    const box1 = await page.waitForSelector('#box1')
    if (box1 == null) throw new Error('box not found')
    const box2 = await page.waitForSelector('#box2')
    if (box2 == null) throw new Error('box not found')
    const box3 = await page.waitForSelector('#box3')
    if (box3 == null) throw new Error('box not found')

    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })

    expect(await box1.isIntersectingViewport()).toBeTruthy()
    await cursor.click(box1)
    expect(await getScrollPosition()).toEqual({ top: 0, left: 0 })
    expect(await box1.isIntersectingViewport()).toBeTruthy()

    expect(await box2.isIntersectingViewport()).toBeFalsy()
    await cursor.move(box2)
    expect(await getScrollPosition()).toEqual({ top: 2500, left: 0 })
    expect(await box2.isIntersectingViewport()).toBeTruthy()

    expect(await box3.isIntersectingViewport()).toBeFalsy()
    await cursor.move(box3)
    expect(await getScrollPosition()).toEqual({ top: 4450, left: 2250 })
    expect(await box3.isIntersectingViewport()).toBeTruthy()

    expect(await box1.isIntersectingViewport()).toBeFalsy()
    await cursor.click(box1)
    expect(await box1.isIntersectingViewport()).toBeTruthy()
  })
})

jest.setTimeout(15_000)
