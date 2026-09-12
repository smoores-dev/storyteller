import { expect } from "@playwright/test"
import type { ReaderFixture } from "./support.ts"

// Read-only, scenario-specific selection. The caller chooses where to navigate.
export async function pageSentences(reader: ReaderFixture) {
  const visible = await reader.page.evaluate(() => {
    if (
      !Array.from(window.reader.document().fonts).some(
        (face) => face.family === "Fixture" && face.status === "loaded",
      )
    )
      throw new Error(
        "Fixture font did not load; fetch the Git LFS font assets",
      )
    return Array.from(
      window.reader.document().querySelectorAll("p[id]"),
      (el) => window.reader.measure(el.id),
    ).filter((item) => item.ratio > 0.99)
  })
  expect(
    visible.length,
    "Reflow scenario needs two fully visible sentences",
  ).toBeGreaterThanOrEqual(2)
  return { first: visible[0]!.id, target: visible.at(-1)!.id }
}

// Returning the real operation lets a test hold the response and interleave
// navigation without shared start/finish state in the browser harness.
export function applyCustomFont(reader: ReaderFixture) {
  return reader.page.evaluate(async () => {
    const doc = window.reader.document()
    const face = new doc.defaultView!.FontFace(
      "LateFixture",
      `url('${new URL("/fonts/OpenDyslexic-Regular.otf?late", location.href)}')`,
    )
    doc.fonts.add(face)
    await Promise.all([
      face.load(),
      window.reader.reflow({
        css: "body { font-family: LateFixture, Fixture, serif !important; }",
      }),
    ])
  })
}
