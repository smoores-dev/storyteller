import { reflowBook } from "./fixtures/reflow.ts"
import { pageSentences } from "./reflow-support.ts"
import { test, expect } from "./support.ts"

test("reflow reports fresh visibility for the active playhead", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { first } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${first}`)
  await reader.page.evaluate((id) => window.reader.highlight(id), first)
  const before = await reader.snapshot()
  await reader.page.evaluate(() =>
    window.reader.reflow({ css: "body { font-size: 21px !important; }" }),
  )
  const after = await reader.snapshot()
  const visibility = after.messages
    .slice(before.messages.length)
    .filter(
      (message) =>
        message.name === "ElementVisibility" && message.body.textId === first,
    )
  expect(visibility.length).toBeGreaterThan(0)
})

for (const [id, offScreenRatio] of [
  ["sentence-80", 1],
  ["sentence-0", 0],
] as const) {
  test(`fully offscreen ${id} reports visibility and forward direction`, async ({
    reader,
  }) => {
    await reader.open({ book: reflowBook() })
    await reader.navigate("chapter.xhtml#sentence-40")
    const offscreen = await reader.page.evaluate(
      (id) => window.reader.measure(id),
      id,
    )
    expect(offscreen.area).toBeGreaterThan(0)
    expect(offscreen.visibleArea).toBe(0)
    await reader.page.evaluate((id) => window.reader.highlight(id, false), id)
    const state = await reader.snapshot()
    const message = state.messages.findLast(
      (m) => m.name === "ElementVisibility",
    )
    expect(message?.body.textId).toBe(id)
    expect(message?.body.visibleRatio).toBe(0)
    expect(message?.body.offScreenRatio).toBeCloseTo(offScreenRatio)
  })
}

test("reflow does not report a cleared highlight", async ({ reader }) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { first } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${first}`)
  await reader.page.evaluate((id) => window.reader.highlight(id), first)
  await reader.page.evaluate(() => window.reader.clearHighlight())
  const before = await reader.snapshot()
  await reader.page.evaluate(() =>
    window.reader.reflow({ css: "body { font-size: 21px !important; }" }),
  )
  const after = await reader.snapshot()
  expect(
    after.messages
      .slice(before.messages.length)
      .filter((message) => message.name === "ElementVisibility"),
  ).toEqual([])
})
