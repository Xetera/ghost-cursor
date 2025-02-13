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
  scrollDelay: 0
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
    await cursor.click('#box')
  })

  it('Should click on the element without throwing an error (XPath selector)', async () => {
    await cursor.click('//*[@id="box"]')
  })
})

jest.setTimeout(15_000)
