import { Page } from 'puppeteer'
import { createCursor, GhostCursor } from '../spoof'
import * as path from 'path'
import { promises as fs } from 'fs'
import installMouseHelper from '../mouse-helper'

declare const page: Page

let cursor: GhostCursor

describe('Mouse movements', () => {
  beforeAll(async () => {
    await installMouseHelper(page)
    const html = await fs.readFile(
      path.join(__dirname, 'custom-page.html'),
      'utf8'
    )
    await page.goto('data:text/html,' + encodeURIComponent(html), {
      waitUntil: 'networkidle2'
    })
  })

  it('Should click on the element without throwing an error', async () => {
    cursor = createCursor(page)
    await cursor.click('#box')
  })
})

jest.setTimeout(15_000)
