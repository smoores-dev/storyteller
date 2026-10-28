// Browser input and JSEvaluating adapter for the Swift integration tests.
// The real ReadingSession makes every following/navigation decision.
import { once } from "node:events"
import { createInterface } from "node:readline"

import { chromium, webkit } from "@playwright/test"

import { reflowBook } from "./fixtures/reflow.ts"

process.env.READER_TEST_PORT = "0"
const { server } = await import("./server.ts")
if (!server.listening) await once(server, "listening")
const browser = await { chromium, webkit }[process.argv[2]].launch()
const page = await browser.newPage({ hasTouch: true })
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n")
await page.exposeFunction("reportReadingState", (state) => send({ state }))
page.on("pageerror", (error) => send({ error: String(error) }))
await page.goto(`http://127.0.0.1:${server.address().port}/harness/reader.html`)
await page.waitForFunction(() => Boolean(window.reader))
const pageTurnBook = reflowBook({
  writingMode: process.argv[3] === "vertical" ? "vertical-rl" : "horizontal-tb",
})
pageTurnBook.sections[0].id = "chapter-0.xhtml"
await page.evaluate(
  async (book) => {
    const handlers = window.webkit.messageHandlers
    window.webkit.messageHandlers = new Proxy(handlers, {
      get(target, name) {
        if (name !== "ReadingState") return target[name]
        return {
          postMessage: (body) => {
            target[name].postMessage(body)
            void window.reportReadingState(body)
          },
        }
      },
    })
    await window.reader.open(
      book
        ? { book }
        : {
            width: 400,
            height: 400,
            book: {
              sections: [
                {
                  id: "chapter-0.xhtml",
                  html: `<!doctype html><html><head><style>
          body { margin: 0; font: 20px/30px serif; }
          p { margin: 0; orphans: 1; widows: 1; }
        </style></head><body><div style="height:305px"></div>
          <p><span id="s0">${"word ".repeat(100)}</span></p>
          <p><span id="s1">The next sentence must become highlighted and visible.</span></p>
        </body></html>`,
                },
              ],
            },
          },
    )
    // The harness forwards these methods directly to the shipped FoliateManager.
    window.foliateManager = window.reader
  },
  ["page-turns", "vertical"].includes(process.argv[3]) ? pageTurnBook : null,
)
send({ ready: true })

// Chromium exposes native touch dragging through CDP. This moves the real
// scroll container; it does not manufacture relocation or gesture receipts.
async function swipe(direction, canceled, repeatAfter) {
  const cdp = await page.context().newCDPSession(page)
  try {
    const bounds = await page.locator("foliate-view").boundingBox()
    const start = bounds.x + bounds.width * (direction > 0 ? 0.8 : 0.2)
    const y = bounds.y + bounds.height / 2
    const touch = (type, x) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 0 }],
      })
    const drag = async (canceled) => {
      await touch("touchStart", start)
      const distance = bounds.width * (canceled ? 0.12 : 0.65) * direction
      for (let step = 1; step <= 6; step++) {
        await touch("touchMove", start - (distance * step) / 6)
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      if (canceled) await touch("touchMove", start - 10 * direction)
      // Release without momentum so a completed drag turns exactly one page.
      await new Promise((resolve) => setTimeout(resolve, 150))
      await touch("touchEnd")
    }
    await drag(canceled)
    if (repeatAfter !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, Number(repeatAfter)))
      if (
        !(await page.evaluate(
          () => window.reader.readingSnapshot().gesture?.active,
        ))
      )
        throw new Error("First gesture settled before the overlapping touch")
      await drag(true)
    }
  } finally {
    await cdp.detach()
  }
}

const input = createInterface({ input: process.stdin })
input.on("line", async (line) => {
  const {
    id,
    script,
    swipe: direction,
    canceled,
    repeatAfter,
    resizeHeld,
    dragBeforeResize,
    wheel,
  } = JSON.parse(line)
  try {
    if (resizeHeld) {
      const cdp = await page.context().newCDPSession(page)
      try {
        const bounds = await page.locator("foliate-view").boundingBox()
        const start = await page.evaluate(() => window.reader.snapshot().start)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            {
              x: bounds.x + bounds.width / 2,
              y: bounds.y + bounds.height / 2,
              id: 0,
            },
          ],
        })
        if (dragBeforeResize === "true") {
          for (let step = 1; step <= 6; step++) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [
                {
                  x: bounds.x + bounds.width * (0.5 - step * 0.05),
                  y: bounds.y + bounds.height / 2,
                  id: 0,
                },
              ],
            })
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          const moved = await page.evaluate(
            () => window.reader.snapshot().start,
          )
          if (Math.abs(moved - start) < 1)
            throw new Error("Native drag did not move the viewport")
        }
        await page.evaluate((height) => {
          window.heldReflow = window.reader.reflow({ height })
        }, Number(resizeHeld))
        await new Promise((resolve) => setTimeout(resolve, 150))
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        })
        await page.evaluate(() => window.heldReflow)
      } finally {
        await cdp.detach()
      }
      send({ id, result: null })
    } else if (wheel) {
      const bounds = await page.locator("foliate-view").boundingBox()
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      )
      await page.mouse.wheel(0, Number(wheel))
      send({ id, result: null })
    } else if (direction) {
      await swipe(Number(direction), canceled === "true", repeatAfter)
      send({ id, result: null })
    } else send({ id, result: (await page.evaluate(script)) ?? null })
  } catch (error) {
    send({ id, error: String(error) })
  }
})
input.on("close", async () => {
  await browser.close()
  server.close()
})
