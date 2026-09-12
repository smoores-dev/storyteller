import { test, expect } from "./support.ts"
import type { FoliateView } from "./harness.d.ts"
import { reflowBook } from "./fixtures/reflow.ts"
import { pageSentences } from "./reflow-support.ts"

for (const highlighted of [true, false]) {
  test(`explicit seek preserves its reflow anchor with highlight ${highlighted}`, async ({
    reader,
  }) => {
    await reader.open({ book: reflowBook() })
    await reader.navigate("chapter.xhtml#sentence-40")
    const { first, target } = await pageSentences(reader)
    await reader.navigate(`chapter.xhtml#${first}`)
    const before = await reader.snapshot()
    await reader.page.evaluate(
      async ({ target, highlighted }) => {
        window.reader.setReflowAnchor(0, target)
        if (highlighted) await window.reader.highlight(target, false)
        else window.reader.clearHighlight()
        await window.reader.settled()
      },
      { target, highlighted },
    )
    const after = await reader.snapshot()
    expect(after.start).toBe(before.start)
    expect(after.relocations).toEqual(before.relocations)

    await reader.page.evaluate(() => window.reader.reflow({ height: 480 }))
    expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)
    await reader.page.evaluate(() =>
      window.reader.reflow({ css: "body { font-size: 28px !important; }" }),
    )
    expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)
  })
}

test("explicit seek in scrolling mode highlights without moving the viewport", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.page.evaluate(async () => {
    const renderer = (document.querySelector("foliate-view") as FoliateView)
      .renderer
    renderer.setAttribute("flow", "scrolled")
    await window.reader.settled()
  })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { target } = await pageSentences(reader)
  const before = await reader.snapshot()
  await reader.page.evaluate(async (id) => {
    window.reader.setReflowAnchor(0, id)
    await window.reader.highlight(id, false)
  }, target)
  const after = await reader.snapshot()
  expect(after.start).toBe(before.start)
  expect(after.relocations).toEqual(before.relocations)
  expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)
})

test("an offscreen playhead cannot replace the user's reflow anchor", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  expect((await reader.measure("sentence-80")).visibleArea).toBe(0)
  const before = await reader.snapshot()
  await reader.page.evaluate(() =>
    window.reader.setReflowAnchor(0, "sentence-80"),
  )
  expect((await reader.snapshot()).relocations).toEqual(before.relocations)
  await reader.page.evaluate(() => window.reader.reflow({ height: 480 }))
  expect((await reader.measure("sentence-40")).visibleArea).toBeGreaterThan(0)
  expect((await reader.measure("sentence-80")).visibleArea).toBe(0)
})
