// oxlint-disable typescript/ban-ts-comment
import { describe, expect, it } from "vitest"

import { type CharacterRange } from "../char.ts"
import { UriFragment } from "../index.ts"
import { MediaDimensions } from "../media/mediaDimensions.ts"
import { MediaTemporalDimension } from "../media/mediaTemporal.ts"

describe("UriFragment", () => {
  it("should parse a text fragment", () => {
    const fragment = new UriFragment(":~:text=prefix-,start,end,-suffix")

    expect(fragment.directive).toBeDefined()
    expect(fragment.directive.text.length).toBe(1)
    expect(fragment.directive.text[0]?.toString()).toBe(
      "text=prefix-,start,end,-suffix",
    )
    expect(fragment.toString()).toBe("#:~:text=prefix-,start,end,-suffix")
  })

  it("should decode a text fragment", () => {
    const fragment = new UriFragment(
      `:~:text=${encodeURIComponent("one,two,&three")}`,
    )

    expect(fragment.directive).toBeDefined()
    expect(fragment.directive.text.length).toBe(1)
    expect(fragment.directive.text[0]?.decodedTextStart).toBe("one,two,&three")
  })

  it("should parse multiple text fragments", () => {
    const fragment = new UriFragment(":~:text=one&text=two")

    expect(fragment.directive).toBeDefined()
    expect(fragment.directive.text.length).toBe(2)
    expect(fragment.directive.text[0]?.toString()).toBe("text=one")
    expect(fragment.directive.text[1]?.toString()).toBe("text=two")
    expect(fragment.toString()).toBe("#:~:text=one&text=two")
  })

  it("should parse a temporal media fragment", () => {
    const fragment = new UriFragment("t=3.2")

    expect(fragment.identifier).toBeDefined()
    const identifier = fragment.identifier! as {
      kind: "media"
      media: MediaDimensions
    }
    expect(identifier.kind).toBe("media")
    expect(identifier.media.toString()).toBe("t=3.2")
  })

  it("should parse a spatial media fragment", () => {
    const fragment = new UriFragment("xywh=percent:25,25,50,50")

    expect(fragment.identifier).toBeDefined()
    const identifier = fragment.identifier! as {
      kind: "media"
      media: MediaDimensions
    }
    expect(identifier.kind).toBe("media")
    expect(identifier.media.toString()).toBe("xywh=percent:25,25,50,50")
  })

  it("should parse a mixed media fragment", () => {
    const fragment = new UriFragment("t=15&xywh=percent:25,25,50,50")

    expect(fragment.identifier).toBeDefined()
    const identifier = fragment.identifier! as {
      kind: "media"
      media: MediaDimensions
    }
    expect(identifier.kind).toBe("media")
    expect(identifier.media.temporal?.toString()).toBe("15")
    expect(identifier.media.spatial?.toString()).toBe("percent:25,25,50,50")
  })

  it("should only keep the last entry for a given dimension", () => {
    const fragment = new UriFragment("t=15&t=100&id=13&t=1")

    expect(fragment.identifier).toBeDefined()
    const identifier = fragment.identifier! as {
      kind: "media"
      media: MediaDimensions
    }
    expect(identifier.kind).toBe("media")
    expect(identifier.media.toString()).toBe("t=1")
  })

  it("should round-trip unknown key/value pairs", () => {
    const fragment = new UriFragment("t=10&y=fun")

    expect(fragment.toString()).toBe("#t=10&y=fun")
  })

  it("should parse a character range fragment", () => {
    const fragment = new UriFragment("char=50")

    expect(fragment.identifier).toBeDefined()
    const identifier = fragment.identifier! as {
      kind: "char"
      range: CharacterRange
    }
    expect(identifier.kind).toBe("char")
    expect(identifier.range.toString()).toBe("char=50")
  })

  it("should parse an anchor fragment", () => {
    const fragment = new UriFragment("paragraph01")

    expect(fragment.identifier).toBeDefined()
    const identifier = fragment.identifier! as {
      kind: "anchor"
      value: string
    }
    expect(identifier.kind).toBe("anchor")
    expect(identifier.value).toBe("paragraph01")
  })

  it("should parse an identifier and directive", () => {
    const fragment = new UriFragment("paragraph01:~:text=beginning")

    expect(fragment.identifier).toBeDefined()
    const identifier = fragment.identifier! as {
      kind: "anchor"
      value: string
    }
    expect(identifier.kind).toBe("anchor")
    expect(identifier.value).toBe("paragraph01")

    expect(fragment.directive.text.length).toBe(1)
    expect(fragment.directive.text[0]?.textStart).toBe("beginning")

    expect(fragment.toString()).toBe(`#paragraph01:~:text=beginning`)
  })

  it("should parse a multidimensional media identifier", () => {
    const fragment = new UriFragment("t=3.2&xywh=percent:25,25,50,50")

    expect(fragment.identifier).toBeDefined()
    const identifier = fragment.identifier! as {
      kind: "media"
      media: MediaDimensions
    }
    expect(identifier.kind).toBe("media")
    expect(identifier.media.temporal).toBeDefined()
    expect(identifier.media.temporal?.timeStart).toBe("3.2")

    expect(identifier.media.spatial).toBeDefined()
    expect(identifier.media.spatial?.xCoord).toBe(25)
  })

  it("should support building incrementally", () => {
    const fragment = new UriFragment()

    fragment.directive.appendTextDirective("permission,.")

    const media = new MediaDimensions()
    media.temporal = new MediaTemporalDimension()
    media.temporal.timeStart = "3.5"

    fragment.setIdentifier("media", { media })

    expect(fragment.toString()).toBe("#t=3.5:~:text=permission,.")
  })
})
