import { reflowBook } from "./fixtures/reflow.ts"
import type { FoliateView } from "./harness.d.ts"
import { pageSentences } from "./reflow-support.ts"
import { test, expect } from "./support.ts"

test("reflow before a new chapter's first navigation settles preserves navigation completion", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook({ chapterCount: 2 }) })
  await reader.navigate("chapter.xhtml#sentence-5")
  const before = await reader.snapshot()
  await reader.page.evaluate(async () => {
    const view = document.querySelector("foliate-view") as FoliateView
    const renderer = view.renderer
    const scrollToAnchor = renderer.scrollToAnchor
    // Deliver a layout update immediately after the real navigation starts,
    // before scrollend can commit a viewport for the newly loaded chapter.
    renderer.scrollToAnchor = function (...args) {
      renderer.scrollToAnchor = scrollToAnchor
      const navigation = scrollToAnchor.apply(this, args)
      return Promise.all([
        navigation,
        window.reader.reflow({ height: 480 }),
      ]).then(() => {})
    }
    try {
      await window.reader.navigate("chapter-2.xhtml#sentence-40")
    } finally {
      renderer.scrollToAnchor = scrollToAnchor
    }
  })
  const after = await reader.snapshot()
  expect(after.sectionIndex).toBe(1)
  expect((await reader.measure("sentence-40")).visibleArea).toBeGreaterThan(0)
  expect(
    after.relocations
      .slice(before.relocations.length)
      .some(
        (event) => event.sectionIndex === 1 && event.reason === "navigation",
      ),
  ).toBe(true)
  expect(
    after.messages.filter((message) => message.name === "PageFlipped"),
  ).toEqual([])
})

test("cross-chapter navigation preserves the destination anchor through reflow", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook({ chapterCount: 2 }) })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { target } = await pageSentences(reader)
  await reader.navigate("chapter.xhtml#sentence-5")
  const source = await reader.page.evaluateHandle(() =>
    window.reader.document(),
  )
  try {
    await reader.navigate(`chapter-2.xhtml#${target}`)
    expect(
      await reader.page.evaluate(
        (oldDoc) => window.reader.document() !== oldDoc,
        source,
      ),
    ).toBe(true)
    expect(
      await source.evaluate(
        (doc, id) => Boolean(doc.getElementById(id)),
        target,
      ),
    ).toBe(true)
    const arrived = await reader.snapshot()
    expect(arrived.sectionIndex).toBe(1)
    expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)

    await reader.page.evaluate(() =>
      window.reader.reflow({ css: "body { font-size: 28px !important; }" }),
    )
    const after = await reader.snapshot()
    expect(after.sectionIndex).toBe(1)
    expect(
      (await reader.measure(target)).visibleArea,
      "Reflow must preserve the target in the destination document",
    ).toBeGreaterThan(0)
    expect(after.relocations.at(-1)?.reason).toBe("anchor")
    expect(
      after.messages.filter((message) => message.name === "PageFlipped"),
    ).toEqual([])
  } finally {
    await source.dispose()
  }
})

test("reflow after leaving a highlighted chapter does not report its stale highlight", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook({ chapterCount: 2 }) })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { first } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${first}`)
  await reader.page.evaluate((id) => window.reader.highlight(id), first)
  const highlighted = await reader.snapshot()
  expect(
    highlighted.messages.findLast(
      (message) => message.name === "ElementVisibility",
    )?.body.textId,
  ).toBe(first)

  // Keep the old document alive so GC cannot make a stale WeakRef hide the bug.
  const source = await reader.page.evaluateHandle(() =>
    window.reader.document(),
  )
  try {
    await reader.navigate(`chapter-2.xhtml#${first}`)
    expect(
      await reader.page.evaluate(
        (oldDoc) => window.reader.document() !== oldDoc,
        source,
      ),
    ).toBe(true)
    const destination = await reader.page.evaluate(
      (id) => window.reader.measure(id),
      first,
    )
    expect(destination.visibleArea).toBeGreaterThan(0)
    await reader.page.evaluate(() =>
      window.reader.reflow({ css: "body { font-size: 21px !important; }" }),
    )
    const after = await reader.snapshot()
    expect(after.sectionIndex).toBe(1)
    expect(
      after.messages
        .slice(highlighted.messages.length)
        .filter((message) => message.name === "ElementVisibility"),
    ).toEqual([])

    // The identical ID in the new document can become the current highlight
    // and must receive fresh reports on its own subsequent reflows.
    await reader.page.evaluate((id) => window.reader.highlight(id), first)
    const current = await reader.snapshot()
    expect(
      current.messages.findLast(
        (message) => message.name === "ElementVisibility",
      )?.body.textId,
    ).toBe(first)
    await reader.page.evaluate(() => window.reader.reflow({ height: 480 }))
    const refreshed = await reader.snapshot()
    const reports = refreshed.messages
      .slice(current.messages.length)
      .filter((message) => message.name === "ElementVisibility")
    expect(reports.length).toBeGreaterThan(0)
    expect(reports.at(-1)?.body.textId).toBe(first)
    expect(reports.at(-1)?.body.visibleRatio).toBeGreaterThan(0)
  } finally {
    await source.dispose()
  }
})
