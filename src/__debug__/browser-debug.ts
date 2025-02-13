import { type ClickOptions, createCursor } from '../spoof'
import { join } from 'path'
import { promises as fs } from 'fs'
import installMouseHelper from '../mouse-helper'
import puppeteer from 'puppeteer'

const delay = async (ms: number): Promise<void> => {
  if (ms < 1) return
  return await new Promise((resolve) => setTimeout(resolve, ms))
}

const cursorDefaultOptions = {
  moveDelay: 0,
  moveSpeed: 99,
  hesitate: 0,
  waitForClick: 0,
  scrollWait: 0
} as const satisfies ClickOptions

puppeteer.launch({ headless: false }).then(async (browser) => {
  const page = await browser.newPage()

  await installMouseHelper(page)

  const cursor = createCursor(page, undefined, undefined, {
    move: cursorDefaultOptions,
    click: cursorDefaultOptions,
    moveTo: cursorDefaultOptions
  })

  const html = await fs.readFile(join(__dirname, 'custom-page.html'), 'utf8')

  await page.goto('data:text/html,' + encodeURIComponent(html), {
    waitUntil: 'networkidle2'
  })

  const performActions = async (): Promise<void> => {
    await cursor.click('#box')

    await cursor.click('#boxOutOfView')
  }

  await performActions()

  // allows us to hit "refresh" button to restart the events
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  page.on('load', async () => {
    await delay(500)
    await page.evaluate(() => { window.scrollTo(0, 0) })
    await delay(1000)

    await performActions()
  })
}).catch((e) => {
  console.error(e)
})
