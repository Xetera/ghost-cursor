import type { Page } from 'puppeteer'

/**
 * This injects a box into the page that moves with the mouse.
 * Useful for debugging.
 *
 * @returns `removeMouseHelper` function that removes the ghost cursor.
 */
async function installMouseHelper (page: Page): Promise<{ removeMouseHelper: () => Promise<void> }> {
  let _removeMouseHelper: undefined | (() => void)

  const { identifier: evaluateOnNewDocumentId } = await page.evaluateOnNewDocument(() => {
    const attachListener = (): void => {
      const box = document.createElement('p-mouse-pointer')
      const styleElement = document.createElement('style')
      styleElement.innerHTML = `
        p-mouse-pointer {
          pointer-events: none;
          position: absolute;
          top: 0;
          z-index: 10000;
          left: 0;
          width: 20px;
          height: 20px;
          background: rgba(0,0,0,.4);
          border: 1px solid white;
          border-radius: 10px;
          box-sizing: border-box;
          margin: -10px 0 0 -10px;
          padding: 0;
          transition: background .2s, border-radius .2s, border-color .2s;
        }
        p-mouse-pointer.button-1 {
          transition: none;
          background: rgba(0,0,0,0.9);
        }
        p-mouse-pointer.button-2 {
          transition: none;
          border-color: rgba(0,0,255,0.9);
        }
        p-mouse-pointer.button-3 {
          transition: none;
          border-radius: 4px;
        }
        p-mouse-pointer.button-4 {
          transition: none;
          border-color: rgba(255,0,0,0.9);
        }
        p-mouse-pointer.button-5 {
          transition: none;
          border-color: rgba(0,255,0,0.9);
        }
        p-mouse-pointer-hide {
          display: none;
        }
      `
      document.head.appendChild(styleElement)
      document.body.appendChild(box)

      const onMouseMove = (event: MouseEvent): void => {
        box.style.left = `${event.pageX}px`
        box.style.top = `${event.pageY}px`
        box.classList.remove('p-mouse-pointer-hide')
        updateButtons(event.buttons)
      }

      const onMouseDown = (event: MouseEvent): void => {
        updateButtons(event.buttons)
        box.classList.add(`button-${event.which}`)
        box.classList.remove('p-mouse-pointer-hide')
      }

      const onMouseUp = (event: MouseEvent): void => {
        updateButtons(event.buttons)
        box.classList.remove(`button-${event.which}`)
        box.classList.remove('p-mouse-pointer-hide')
      }

      const onMouseLeave = (event: MouseEvent): void => {
        updateButtons(event.buttons)
        box.classList.add('p-mouse-pointer-hide')
      }

      const onMouseEnter = (event: MouseEvent): void => {
        updateButtons(event.buttons)
        box.classList.remove('p-mouse-pointer-hide')
      }

      function updateButtons (buttons: number): void {
        for (let i = 0; i < 5; i++) {
          box.classList.toggle(`button-${i}`, Boolean(buttons & (1 << i)))
        }
      }

      document.addEventListener('mousemove', onMouseMove, true)
      document.addEventListener('mousedown', onMouseDown, true)
      document.addEventListener('mouseup', onMouseUp, true)
      document.addEventListener('mouseleave', onMouseLeave, true)
      document.addEventListener('mouseenter', onMouseEnter, true)

      _removeMouseHelper = () => {
        document.removeEventListener('mousemove', onMouseMove, true)
        document.removeEventListener('mousedown', onMouseDown, true)
        document.removeEventListener('mouseup', onMouseUp, true)
        document.removeEventListener('mouseleave', onMouseLeave, true)
        document.removeEventListener('mouseenter', onMouseEnter, true)
        box.remove()
        styleElement.remove()
      }
    }

    if (document.readyState !== 'loading') {
      attachListener()
    } else {
      window.addEventListener('DOMContentLoaded', attachListener, false)
    }
  })

  async function removeMouseHelper (): Promise<void> {
    if (_removeMouseHelper !== undefined) {
      await page.evaluate(() => {
        _removeMouseHelper?.()
      })
    }

    await page.removeScriptToEvaluateOnNewDocument(evaluateOnNewDocumentId)
  }

  /**
   * Removes the previously injected mouse helper (ghost cursor).
   */
  return { removeMouseHelper }
}

export default installMouseHelper
export { installMouseHelper }
