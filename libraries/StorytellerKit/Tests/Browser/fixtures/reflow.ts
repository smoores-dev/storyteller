import type { BookDefinition } from "../harness.d.ts"

// Scenario data, independent of the browser book adapter and reader lifecycle.
export function reflowBook({
  chapterCount = 1,
  writingMode = "horizontal-tb",
} = {}): BookDefinition {
  const text = Array.from(
    { length: 120 },
    (_, index) =>
      `<p id="sentence-${index}">Sentence ${index}. This is an example sentence for checking the saved reading position and the page that contains the audio playhead. The quick brown fox jumps over the lazy dog.</p>`,
  ).join("")
  const html = `<!doctype html><html lang="en"><head><style>
    @font-face { font-family: Fixture; src: url('/fonts/Charis-Regular.ttf'); }
    body { font: 20px/1.5 Fixture, serif; padding: 0 20px; writing-mode: ${writingMode}; }
    p { margin: 0 0 1em; }
  </style></head><body>${text}</body></html>`
  return {
    metadata: { title: "Reflow fixture" },
    // Repeat sentence IDs across documents to catch stale anchors/highlights.
    sections: Array.from({ length: chapterCount }, (_, index) => ({
      id: index === 0 ? "chapter.xhtml" : `chapter-${index + 1}.xhtml`,
      html,
    })),
  }
}
