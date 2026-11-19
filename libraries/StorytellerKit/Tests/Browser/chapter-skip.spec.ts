import { expect, test } from "./support.ts"

for (const action of ["swipe", "contents"] as const) {
  test(`entering a shorter chapter by ${action} stays on its first page`, async ({
    reader,
  }) => {
    await reader.open({
      book: "/fixtures/chapter-skip.epub",
      href: "departure.xhtml#page-30",
    })

    // The native trace caught a scrollend as the shorter chapter was laying
    // out, before navigation placed it on page one. Keep its font in flight
    // across a paint so fast desktop browsers can exercise that ordering.
    await reader.page.route("**/fonts/Charis-Regular.ttf", async (route) => {
      await reader.page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      await route.continue()
    })
    await reader.page.evaluate(() =>
      window.reader.reflow({
        css: `@font-face { font-family: ArrivalFont; src: url("${location.origin}/fonts/Charis-Regular.ttf") }
            #arrival { font-family: ArrivalFont }`,
      }),
    )

    expect((await reader.measure("page-30")).ratio).toBeGreaterThan(0.99)
    await reader.page.locator("foliate-view").hover()
    for (const [direction, section, heading] of [
      [1, 1, "page-1"],
      [-1, 0, "page-30"],
    ] as const) {
      const { size, relocations } = await reader.snapshot()
      if (action === "contents" && direction === 1) {
        await reader.page.evaluate(() => {
          const { documentID } = window.reader.readingSnapshot()
          window.reader.readingCommand({
            documentID,
            id: "contents-jump",
            kind: "href",
            value: "arrival.xhtml",
          })
        })
        await expect
          .poll(() =>
            reader.page.evaluate(
              () => window.reader.readingSnapshot().command?.status,
            ),
          )
          .toBe("completed")
      } else {
        await reader.page.mouse.wheel(direction * size!, 0)
      }
      await reader.page.evaluate(
        (mark) => window.reader.afterRelocation(mark, "navigation"),
        relocations.length,
      )
      const after = await reader.snapshot()
      expect(after.sectionIndex).toBe(section)
      expect((await reader.measure(heading)).ratio).toBeGreaterThan(0.99)
      expect(
        after.relocations.slice(relocations.length).map((r) => r.sectionIndex),
      ).not.toContain(2)
    }
  })
}
