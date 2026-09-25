import { describe, expect, it } from "vitest"

import { TextDirective } from "../text.ts"

describe("UriTextfragment.constructor", () => {
  it("should parse a full text fragment", () => {
    const fragment = new TextDirective("prefix-,start,end,-suffix")

    expect(fragment.prefix).toBe("prefix")
    expect(fragment.textStart).toBe("start")
    expect(fragment.textEnd).toBe("end")
    expect(fragment.suffix).toBe("suffix")
  })

  it("should parse a text fragment with no prefix", () => {
    const fragment = new TextDirective("start,end,-suffix")

    expect(fragment.prefix).toBeUndefined()
    expect(fragment.textStart).toBe("start")
    expect(fragment.textEnd).toBe("end")
    expect(fragment.suffix).toBe("suffix")
  })

  it("should parse a text fragment with no prefix or end", () => {
    const fragment = new TextDirective("start,-suffix")

    expect(fragment.prefix).toBeUndefined()
    expect(fragment.textStart).toBe("start")
    expect(fragment.textEnd).toBeUndefined()
    expect(fragment.suffix).toBe("suffix")
  })

  it("should parse a text fragment with no prefix or suffix", () => {
    const fragment = new TextDirective("start,end")

    expect(fragment.prefix).toBeUndefined()
    expect(fragment.textStart).toBe("start")
    expect(fragment.textEnd).toBe("end")
    expect(fragment.suffix).toBeUndefined()
  })

  it("should parse a text fragment with no prefix, end, or suffix", () => {
    const fragment = new TextDirective("start")

    expect(fragment.prefix).toBeUndefined()
    expect(fragment.textStart).toBe("start")
    expect(fragment.textEnd).toBeUndefined()
    expect(fragment.suffix).toBeUndefined()
  })

  it("should parse a text fragment with no end or suffix", () => {
    const fragment = new TextDirective("prefix-,start")

    expect(fragment.prefix).toBe("prefix")
    expect(fragment.textStart).toBe("start")
    expect(fragment.textEnd).toBeUndefined()
    expect(fragment.suffix).toBeUndefined()
  })

  it("should parse a text fragment with no end", () => {
    const fragment = new TextDirective("prefix-,start,-suffix")

    expect(fragment.prefix).toBe("prefix")
    expect(fragment.textStart).toBe("start")
    expect(fragment.textEnd).toBeUndefined()
    expect(fragment.suffix).toBe("suffix")
  })

  it("should parse a text fragment with no suffix", () => {
    const fragment = new TextDirective("prefix-,start,end")

    expect(fragment.prefix).toBe("prefix")
    expect(fragment.textStart).toBe("start")
    expect(fragment.textEnd).toBe("end")
    expect(fragment.suffix).toBeUndefined()
  })

  it("should reject an empty prefix", () => {
    expect(() => new TextDirective("-,start")).toThrow()
  })

  it("should reject an empty suffix", () => {
    expect(() => new TextDirective("start,-")).toThrow()
  })

  it("should provide URL-decoded text", () => {
    const fragment = new TextDirective("this%20is%20a%20sentence")

    expect(fragment.decodedTextStart).toBe("this is a sentence")
  })
})
