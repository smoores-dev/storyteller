import { describe, expect, it } from "vitest"

import { chapterIndexOf } from "../index.ts"

describe("chapterIndexOf", () => {
  it("reads the chapter out of a device pointer", () => {
    // `/DocFragment[n]` is 1-based where the spine is 0-based, which is the trap.
    expect(
      chapterIndexOf(
        "/body[1]/DocFragment[3]/body[1]/div[1]/p[4]/text()[1].64",
      ),
    ).toBe(2)
  })

  it("reads a path that stops at the fragment", () => {
    expect(chapterIndexOf("/body[1]/DocFragment[2]")).toBe(1)
    expect(chapterIndexOf("/body[1]/DocFragment[1].0")).toBe(0)
  })

  it("reads the legacy dialect, which leaves [1] out", () => {
    expect(chapterIndexOf("/body/DocFragment[3]/body/p[1]")).toBe(2)
  })

  it("has no chapter for anything else", () => {
    for (const xpointer of [
      "",
      "#chapter-2",
      "/html[1]/body[1]/p[1]",
      "/body[1]/p[1]",
      "/body[1]/div[1]/DocFragment[2]/body[1]",
      "/body[1]/DocFragment[0]/body[1]",
      "/body[1]/DocFragment/body[1]",
      "nonsense",
    ]) {
      expect(chapterIndexOf(xpointer)).toBeNull()
    }
  })
})
