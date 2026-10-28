import { reflowBook } from "./fixtures/reflow.ts"
import { pageSentences, applyCustomFont } from "./reflow-support.ts"
import { test, expect } from "./support.ts"

for (const width of [412, 412.125]) {
  test(`restored sentence survives font reflow at width ${width}`, async ({
    reader,
  }) => {
    await reader.open({ book: reflowBook(), width })
    await reader.navigate("chapter.xhtml#sentence-40")
    const { target } = await pageSentences(reader)
    await reader.navigate(`chapter.xhtml#${target}`)
    await reader.page.evaluate(() =>
      window.reader.reflow({ css: "body { font-size: 28px !important; }" }),
    )
    expect(
      (await reader.measure(target)).visibleArea,
      "Restored sentence must intersect the settled viewport",
    ).toBeGreaterThan(0)
  })
}

test("restored sentence survives a late bottom inset", async ({ reader }) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { target } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${target}`)
  await reader.page.evaluate(() => window.reader.reflow({ height: 480 }))

  expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)
})

test("same-page playhead survives reflow", async ({ reader }) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { first, target } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${first}`)
  expect((await reader.measure(target)).ratio).toBeGreaterThan(0.99)
  const before = await reader.snapshot()
  await reader.page.evaluate((id) => window.reader.highlight(id), target)
  const highlighted = await reader.snapshot()
  expect(
    highlighted.relocations.length,
    "Same-page advancement should not navigate",
  ).toBe(before.relocations.length)
  await reader.page.evaluate(() => window.reader.reflow({ height: 480 }))
  expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)
})

test("restored sentence survives delayed custom font loading", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { first, target } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${first}`)
  expect((await reader.measure(target)).ratio).toBeGreaterThan(0.99)
  const { promise: held, resolve: release } = Promise.withResolvers<void>()
  const { promise: requestStarted, resolve: requested } =
    Promise.withResolvers<void>()
  await reader.page.route("**/OpenDyslexic-Regular.otf?late", async (route) => {
    requested()
    await held
    await route.continue()
  })
  try {
    const fontLoad = applyCustomFont(reader)
    await requestStarted
    // Await real navigation completion while the custom font is unavailable.
    // Do not await document.fonts.ready until the held response is released.
    await reader.page.evaluate(
      (id) => window.reader.goTo(`chapter.xhtml#${id}`),
      target,
    )
    const mark = (await reader.snapshot()).relocations.length
    release()
    await fontLoad
    await reader.page.evaluate(
      (mark) => window.reader.afterRelocation(mark, "anchor"),
      mark,
    )

    expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)
  } finally {
    release()
  }
})

test("font loaded before restoration reaches the saved sentence", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { first, target } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${first}`)
  expect((await reader.measure(target)).ratio).toBeGreaterThan(0.99)
  await applyCustomFont(reader)
  await reader.navigate(`chapter.xhtml#${target}`)
  expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)
})

test("manual page turns preserve the user's visible text through reflow", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { first, target } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${first}`)
  expect((await reader.measure(target)).ratio).toBeGreaterThan(0.99)
  await reader.page.evaluate((id) => window.reader.highlight(id), target)
  await reader.page.evaluate(() => window.reader.turnPage())
  const savedText = await reader.page.evaluateHandle(() =>
    window.reader.visibleTextRange(),
  )
  try {
    // A passive playback highlight must not reclaim the user's reading position.
    await reader.page.evaluate(
      (id) => window.reader.highlight(id, false),
      target,
    )
    await reader.page.evaluate(() =>
      window.reader.reflow({ css: "body { font-size: 28px !important; }" }),
    )
    const text = await reader.page.evaluate(
      (range) => window.reader.geometry(range),
      savedText,
    )
    expect(text.visibleArea).toBeGreaterThan(0)
  } finally {
    await savedText.dispose()
  }
})

test("playhead advancement during reflow is preserved by subsequent reflows", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  const { first, target } = await pageSentences(reader)
  await reader.navigate(`chapter.xhtml#${first}`)
  expect((await reader.measure(target)).ratio).toBeGreaterThan(0.99)
  await reader.page.evaluate(async (id) => {
    // Start a small resize that leaves the target visible, then advance the
    // playhead synchronously while the reflow transaction still owns layout.
    const reflow = window.reader.reflow({ height: 801 })
    if (window.reader.measure(id).visibleArea <= 0)
      throw new Error(
        "Fixture must keep the followed sentence on the current page",
      )
    await window.reader.highlight(id)
    await reflow
  }, target)
  await reader.page.evaluate(() => window.reader.reflow({ height: 480 }))
  expect((await reader.measure(target)).visibleArea).toBeGreaterThan(0)
})

test("navigation requested during reflow reaches its destination", async ({
  reader,
}) => {
  await reader.open({ book: reflowBook() })
  await reader.navigate("chapter.xhtml#sentence-40")
  await reader.page.evaluate(async () => {
    const reflow = window.reader.reflow({ height: 480 })
    const navigation = window.reader.goTo("chapter.xhtml#sentence-80", {
      smooth: true,
    })
    await reflow
    await navigation
    await window.reader.settled()
  })
  const result = await reader.snapshot()
  const destination = await reader.page.evaluate(() =>
    window.reader.measure("sentence-80"),
  )
  expect(destination.visibleArea).toBeGreaterThan(0)
  expect(result.relocations.at(-1)?.reason).toBe("navigation")
  expect(
    result.messages.filter(
      (m) =>
        m.name === "ReadingState" &&
        (m.body.gesture as { moved?: boolean } | null)?.moved,
    ),
  ).toEqual([])
})
