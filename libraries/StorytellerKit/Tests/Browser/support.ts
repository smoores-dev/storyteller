import { test as base, expect } from "@playwright/test"
import type { Page } from "@playwright/test"

import type { OpenOptions, ReaderSnapshot, Measurement } from "./harness.d.ts"

export interface ReaderFixture {
  page: Page
  open(options: OpenOptions): Promise<void>
  navigate(href: string): Promise<void>
  measure(id: string): Promise<Measurement>
  snapshot(): Promise<ReaderSnapshot>
}

export const test = base.extend<{ reader: ReaderFixture }>({
  reader: async ({ page }, use, testInfo) => {
    const errors: string[] = [],
      consoleLog: string[] = []
    page.on("pageerror", (error) => errors.push(error.stack ?? String(error)))
    page.on("console", (message) => {
      consoleLog.push(`${message.type()}: ${message.text()}`)
      if (consoleLog.length > 300) consoleLog.shift()
    })
    try {
      await page.goto("/harness/reader.html")
      await page.waitForFunction(() => Boolean(window.reader))
      await use({
        page,
        open: (options) =>
          page.evaluate((options) => window.reader.open(options), options),
        navigate: (href) =>
          page.evaluate((href) => window.reader.navigate(href), href),
        measure: (id) => page.evaluate((id) => window.reader.measure(id), id),
        snapshot: () => page.evaluate(() => window.reader.snapshot()),
      })
    } finally {
      if (testInfo.status !== "passed" || errors.length) {
        const state = await page
          .evaluate(() => window.reader?.snapshot())
          .catch(() => null)
        await testInfo.attach("reader-diagnostics", {
          body: JSON.stringify({ state, errors, consoleLog }, null, 2),
          contentType: "application/json",
        })
      }
      expect(errors, "Reader must not have uncaught JavaScript errors").toEqual(
        [],
      )
    }
  },
})

export { expect }
