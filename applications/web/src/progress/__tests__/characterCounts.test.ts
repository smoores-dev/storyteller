import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  Epub,
  MemoryAdapter,
  type Document,
  isText,
  parse,
} from "@storyteller-platform/epub"

import { characterReferenceFromAnchor } from "@/progress/characterCounts/fromAnchor.ts"
import {
  characterCountFromNode as offsetOf,
  uriReferenceFromCharacterCount,
} from "@/progress/characterCounts/fromNode.ts"
import { characterCountToAnchorRef } from "@/progress/characterCounts/toAnchor.ts"
import { characterCountToNode } from "@/progress/characterCounts/toNode.ts"
import { type UriReference } from "@/progress/uriReference.ts"

import { CHAPTER_1, CHAPTER_2, buildEpub, refStrings } from "./fixtures.ts"

const XHTML_NS = "http://www.w3.org/1999/xhtml"

function doc(body: string): Document {
  return parse(
    [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<html xmlns="${XHTML_NS}"><head><title>T</title></head>`,
      body,
      `</html>`,
    ].join(""),
    "application/xhtml+xml",
  )
}

function position(document: Document, chars: number): string | null {
  const at = characterCountToNode(document, chars)
  if (!at) return null

  const node = isText(at.node) ? JSON.stringify(at.node.data) : at.node.nodeName
  return `${node}@${at.offset}`
}

/** Every position from 0 up to (but not including) `end`. */
function positions(document: Document, end: number): (string | null)[] {
  return Array.from({ length: end }, (_, chars) => position(document, chars))
}

let dir!: string
let ebook!: string
let bareEbook!: string
let firstOnlyEbook!: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "storyteller-progress-counts-"))
  ebook = await buildEpub(join(dir, "ebook"), { name: "ebook" })
  bareEbook = await buildEpub(join(dir, "bare"), {
    name: "bare",
    idStyle: "sections",
  })
  firstOnlyEbook = await buildEpub(join(dir, "first-only"), {
    name: "first-only",
    idStyle: "first-only",
  })
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("the character offset", () => {
  describe("from a node", () => {
    it("counts every code point of every text node in document order", () => {
      const document = doc("<body><p>abc</p><p>de</p></body>")
      const [first, second] = Array.from(
        document.getElementsByTagName("p"),
      ).map((p) => p.firstChild)

      expect(offsetOf(document, first!, 0)).toBe(0)
      expect(offsetOf(document, first!, 2)).toBe(2)
      expect(offsetOf(document, second!, 0)).toBe(3)
      expect(offsetOf(document, second!, 1)).toBe(4)
    })

    it("counts one for every element without children", () => {
      const document = doc("<body><p>a<br/>b</p></body>")
      const paragraph = document.getElementsByTagName("p")[0]!
      const br = document.getElementsByTagName("br")[0]!
      const [before, after] = [...paragraph.childNodes].filter(isText)

      expect(offsetOf(document, before!, 0)).toBe(0)
      expect(offsetOf(document, br, 0)).toBe(1)
      expect(offsetOf(document, after!, 0)).toBe(2)
    })

    it("does not count comments", () => {
      const document = doc("<body><!-- a comment --><p>a</p></body>")
      const text = document.getElementsByTagName("p")[0]!.firstChild!

      expect(offsetOf(document, text, 0)).toBe(0)
    })

    it("counts a code point per UTF-16 code unit", () => {
      const document = doc("<body><p>a\u{1F600}b</p></body>")
      const text = document.getElementsByTagName("p")[0]!.firstChild!

      expect(text.nodeValue?.length).toBe(4)
      expect(offsetOf(document, text, 3)).toBe(3)
    })

    it("counts every character of a whitespace-only text node", () => {
      const document = doc("<body><p>a</p>  \n  <p>b</p></body>")
      const [whitespace] = [
        ...document.getElementsByTagName("body")[0]!.childNodes,
      ].filter(isText)

      expect(whitespace?.nodeValue).toBe("  \n  ")
      expect(offsetOf(document, whitespace!, 3)).toBe(4)
    })

    it("counts the offset of the text an element starts with", () => {
      const document = doc("<body><h1>Hi</h1><p>A</p></body>")
      const paragraph = document.getElementsByTagName("p")[0]!

      expect(offsetOf(document, paragraph, 0)).toBe(2)
    })

    it("returns null for a node outside the body", () => {
      const document = doc("<body><p>a</p></body>")
      const title = document.getElementsByTagName("title")[0]!.firstChild!

      expect(offsetOf(document, title, 0)).toBeNull()
    })
  })

  describe("to a node", () => {
    it("lands on the text node the offset falls in", () => {
      const document = doc("<body><p>abc</p><p>de</p></body>")

      expect(positions(document, 5)).toEqual([
        '"abc"@0',
        '"abc"@1',
        '"abc"@2',
        '"de"@0',
        '"de"@1',
      ])
    })

    it("counts one for every element without children", () => {
      const document = doc("<body><p>a<br/>b</p></body>")

      expect(positions(document, 3)).toEqual(['"a"@0', "br@0", '"b"@0'])
    })

    it("counts nested elements without double counting their text", () => {
      const document = doc(
        "<body><h1>Hi</h1><p>A<br/>B<span>C</span></p></body>",
      )

      expect(positions(document, 6)).toEqual([
        '"Hi"@0',
        '"Hi"@1',
        '"A"@0',
        "br@0",
        '"B"@0',
        '"C"@0',
      ])
    })

    it("counts every character of the whitespace between elements", () => {
      const document = doc("<body><p>a</p>  \n  <p>b</p></body>")

      expect(positions(document, 7)).toEqual([
        '"a"@0',
        '"  \\n  "@0',
        '"  \\n  "@1',
        '"  \\n  "@2',
        '"  \\n  "@3',
        '"  \\n  "@4',
        '"b"@0',
      ])
    })

    it("round trips", () => {
      const document = doc(
        "<body><h1>Hi</h1><p>A<br/>B<span>C</span></p></body>",
      )

      const roundTrip = Array.from({ length: 6 }, (_, chars) => {
        const at = characterCountToNode(document, chars)
        if (!at) return `${chars}: unresolved`
        const back = offsetOf(document, at.node, at.offset)
        return `${chars}: ${back}`
      })

      expect(roundTrip).toEqual([
        "0: 0",
        "1: 1",
        "2: 2",
        "3: 3",
        "4: 4",
        "5: 5",
      ])
    })
  })

  describe("reference", () => {
    it("is written as a char fragment on the resource it belongs to", () => {
      const ref = uriReferenceFromCharacterCount(CHAPTER_1, 27)

      expect(ref).toBeTruthy()
      expect(refStrings([ref])).toEqual([`${CHAPTER_1}#char=27`])
    })

    it("supports offset 0", () => {
      const ref = uriReferenceFromCharacterCount(CHAPTER_1, 0)

      expect(ref).toBeTruthy()
      expect(refStrings([ref])).toEqual([`${CHAPTER_1}#char=0`])
    })
  })
})

describe("anchors", () => {
  it("resolves the offset an anchor starts at", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    const ref = await characterReferenceFromAnchor(epub, CHAPTER_1, "ch1-p2")

    expect(ref?.fragmentKind).toBe("char")
    expect(ref && offset(ref)).toBe(27)
  })

  it("resolves the offset of an anchor in another chapter", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    const ref = await characterReferenceFromAnchor(epub, CHAPTER_2, "ch2-p1")

    expect(ref && offset(ref)).toBe(11)
    expect(ref?.hrefPathname).toBe(CHAPTER_2)
  })

  it("resolves the offset a heading starts at", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    const ref = await characterReferenceFromAnchor(epub, CHAPTER_1, "ch1-title")

    expect(ref && offset(ref)).toBe(0)
  })

  it("returns null for an anchor that is not in the book", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    expect(
      await characterReferenceFromAnchor(epub, CHAPTER_1, "not-in-the-book"),
    ).toBeNull()
  })

  it("resolves the anchor an offset falls in", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    const ref = await characterCountToAnchorRef(epub, CHAPTER_1, 15)

    expect(refStrings([ref])?.[0]).toBe(`${CHAPTER_1}#ch1-p1`)
  })

  it("resolves the anchor an offset at its start falls in", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    const ref = await characterCountToAnchorRef(epub, CHAPTER_1, 27)

    expect(refStrings([ref])?.[0]).toBe(`${CHAPTER_1}#ch1-p2`)
  })

  it("resolves the anchor of an offset in a heading", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    const ref = await characterCountToAnchorRef(epub, CHAPTER_1, 5)

    expect(refStrings([ref])?.[0]).toBe(`${CHAPTER_1}#ch1-title`)
  })

  describe("with bare paragraphs", () => {
    it("resolves the id of an enclosing element", async () => {
      using epub = await Epub.using(MemoryAdapter).from(bareEbook)

      const ref = await characterCountToAnchorRef(epub, CHAPTER_1, 15)

      expect(refStrings([ref])?.[0]).toBe(`${CHAPTER_1}#ch1-body`)
    })

    it("resolves the nearest preceding id when nothing enclosing has one", async () => {
      using epub = await Epub.using(MemoryAdapter).from(firstOnlyEbook)

      // offset 40 is in the second paragraph, which has no id, is not inside
      // anything with an id, and follows <p id="ch1-p1">
      const ref = await characterCountToAnchorRef(epub, CHAPTER_1, 40)

      expect(refStrings([ref])?.[0]).toBe(`${CHAPTER_1}#ch1-p1`)
    })
  })
})

function offset(ref: UriReference): number | undefined {
  const identifier = ref.fragment.identifier
  return identifier?.kind === "char" ? identifier.range.offset : undefined
}
