import { describe, expect, it } from "vitest"

import { crengineText } from "../text.ts"

describe("crengineText", () => {
  it("rewrites whitespace the way the parser does", () => {
    expect(crengineText("a  b\nc").text).toBe("a b c")
    expect(crengineText("  x").text).toBe(" x")
    expect(crengineText("x\t\r\ny").text).toBe("x y")
    // Nothing to collapse: the caller's own offsets are crengine's.
    expect(crengineText("x").text).toBe("x")
  })

  it("keeps pre text but expands tabs to 8-column stops", () => {
    // crengine counts the newline itself as a column, so the tab that follows stops at 7.
    // (ExpandTabs, lvxml.cpp:5638)
    expect(crengineText("a\n\tb", true).text).toBe("a\n       b")
    // The literal space after the tab is pre text, so it survives on top of the stop.
    expect(crengineText("\t x", true).text).toBe("         x")
    expect(crengineText("  a   b  ", true).text).toBe("  a   b  ")
  })

  it("maps carets in both directions", () => {
    const source = "a  b"
    const text = crengineText(source)
    expect(text.text).toBe("a b")
    expect(text.creOffset(0)).toBe(0)
    expect(text.creOffset(1)).toBe(1)
    // Inside the collapsed run, the caret is after the space the run produced.
    expect(text.creOffset(2)).toBe(2)
    expect(text.creOffset(4)).toBe(3)
    expect(text.sourceOffset(1)).toBe(1)
    expect(text.sourceOffset(2)).toBe(2)
    expect(text.sourceOffset(3)).toBe(4)
  })

  it("counts code points, not UTF-16 units", () => {
    const source = "😀 x"
    const text = crengineText(source)
    expect(text.text).toBe("😀 x")
    // Two spaces collapse, so the emoji is character 1 and the space character 2.
    expect(crengineText("😀  x").creOffset("😀  x".length)).toBe(3)
    expect(text.creOffset(4)).toBe(3)
    expect(text.sourceOffset(1)).toBe(2)
    expect(text.textOffset(1)).toBe(2)
    expect(text.textOffset(2)).toBe(3)
  })

  it("round-trips a caret across the rewrite", () => {
    const source = "one  two\n  three"
    const text = crengineText(source)
    for (let offset = 0; offset <= source.length; offset++) {
      const cre = text.creOffset(offset)
      expect(text.sourceOffset(cre)).toBeGreaterThanOrEqual(offset - 2)
      expect(text.creOffset(text.sourceOffset(cre))).toBe(cre)
    }
  })
})
