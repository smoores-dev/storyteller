import type { BookDefinition } from "./harness.d.ts"
import { test, expect } from "./support.ts"

const book: BookDefinition = {
  sections: [
    { id: "opening.html", html: "<p id='welcome'>A short opening.</p>" },
    {
      id: "part/conclusion.html",
      html: "<h1 id='ending'>The end</h1><p>Another short section.</p>",
    },
  ],
}

test("opening a short book stays at its beginning without selecting a target", async ({
  reader,
}) => {
  expect((await reader.snapshot()).sectionIndex).toBeNull()
  await reader.open({ book })
  const before = await reader.snapshot()
  expect(before.sectionIndex).toBe(0)
  expect((await reader.measure("welcome")).ratio).toBeGreaterThan(0.99)
  // Reading diagnostics and geometry must not change navigation or highlight.
  const after = await reader.snapshot()
  expect(after).toEqual(before)
  expect(
    after.messages.filter((message) => message.name === "ElementVisibility"),
  ).toEqual([])
})

test("explicit opening locations and section-only hrefs work with custom content", async ({
  reader,
}) => {
  await reader.open({
    book,
    href: "part/conclusion.html#ending",
    width: 500,
    height: 600,
  })
  expect((await reader.snapshot()).sectionIndex).toBe(1)
  expect((await reader.measure("ending")).visibleArea).toBeGreaterThan(0)
  await reader.navigate("opening.html")
  expect((await reader.snapshot()).sectionIndex).toBe(0)
  expect((await reader.measure("welcome")).visibleArea).toBeGreaterThan(0)
})
