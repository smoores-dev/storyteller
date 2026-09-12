import { reflowBook } from "./fixtures/reflow.ts"
import { test, expect } from "./support.ts"

for (const width of [320, 600]) {
  for (const height of [480, 640]) {
    test(`page-turn playhead survives reflow to ${width}x${height}`, async ({
      reader,
    }) => {
      await reader.open({ book: reflowBook() })
      await reader.navigate("chapter.xhtml#sentence-40")
      await reader.page.evaluate(() => window.reader.turnPage())
      // All fixture sentences are narrated in document order. Native page-turn
      // handling chooses the earliest entry in this production query's result.
      const ids = await reader.page.evaluate(() =>
        window.reader.fullyVisibleElementIds(),
      )
      const target = ids[0]
      expect(target).toBeDefined()
      expect((await reader.measure(target!)).visibleArea).toBeGreaterThan(0)
      const before = await reader.snapshot()
      await reader.page.evaluate((id) => {
        window.reader.setReflowAnchor(0, id)
        return window.reader.highlight(id, false)
      }, target!)
      expect((await reader.snapshot()).relocations.length).toBe(
        before.relocations.length,
      )
      await reader.page.evaluate(
        ({ width, height }) => window.reader.reflow({ width, height }),
        { width, height },
      )
      expect((await reader.measure(target!)).visibleArea).toBeGreaterThan(0)
    })
  }
}
