import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  Epub,
  MemoryAdapter,
  type Document,
  isElement,
  isText,
  parse,
} from "@storyteller-platform/epub"

import { convertEpubDomPointReference } from "@/progress/domPoints/convertEpubDomPointReference.ts"
import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { domPointFromAnchor } from "@/progress/domPoints/fromAnchor.ts"
import { domPointFromCharacterCount } from "@/progress/domPoints/fromChar.ts"
import { domPointReferenceFromXhtmlReferences } from "@/progress/domPoints/fromXhtmlReferences.ts"
import { domPointReferenceToAnchorReference } from "@/progress/domPoints/toAnchorReference.ts"
import { domPointReferenceToCharacterReference } from "@/progress/domPoints/toCharacterReference.ts"
import { domPointReferenceToCrengineXPointerReference } from "@/progress/domPoints/toCrengineXPointerReference.ts"
import { domPointReferenceToEpubCfiReference } from "@/progress/domPoints/toEpubCfiReference.ts"
import { UriReference } from "@/progress/uriReference.ts"

import { CHAPTER_1, CHAPTER_2, buildEpub } from "./fixtures.ts"

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

/** The character offset a reference's fragment carries. */
function offset(ref: UriReference | null): number | undefined {
  const identifier = ref?.fragment.identifier

  return identifier?.kind === "char" ? identifier.range.offset : undefined
}

/** A reference to `chars` characters into `resource`. */
function char(resource: string, chars: number): UriReference {
  return new UriReference(`${resource}#char=${chars}`)
}

let dir!: string
let ebook!: string
let secondEbook!: string
let firstOnlyEbook!: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "storyteller-progress-dom-points-"))

  ebook = await buildEpub(join(dir, "ebook"), { name: "ebook" })
  secondEbook = await buildEpub(join(dir, "second"), {
    name: "second",
  })
  firstOnlyEbook = await buildEpub(join(dir, "first-only"), {
    name: "first-only",
    idStyle: "first-only",
  })
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function point(
  path: string,
  reference: UriReference,
): Promise<DomPointReference> {
  using epub = await Epub.using(MemoryAdapter).from(path)

  const domPointRef = await domPointReferenceFromXhtmlReferences(epub, [
    reference,
  ])

  expect(domPointRef).toBeTruthy()

  return domPointRef!
}

describe("a dom point in a document", () => {
  it("lands on the text node the offset falls in", () => {
    const document = doc("<body><p>Call me Ishmael.</p></body>")

    const domPoint = domPointFromCharacterCount(document, 5)

    expect(domPoint && isText(domPoint.node)).toBe(true)
    expect(domPoint && isText(domPoint.node) && domPoint.node.data).toBe(
      "Call me Ishmael.",
    )
    expect(domPoint?.offset).toBe(5)
  })

  it("counts one for every element without children", () => {
    const document = doc("<body><p><img/><br/>hi</p></body>")

    expect(domPointFromCharacterCount(document, 0)?.node.nodeName).toBe("img")
    expect(domPointFromCharacterCount(document, 1)?.node.nodeName).toBe("br")

    const atText = domPointFromCharacterCount(document, 2)

    expect(atText && isText(atText.node)).toBe(true)
    expect(atText?.offset).toBe(0)
  })

  it("starts at the beginning of the body", () => {
    const document = doc("<body><p>Call me Ishmael.</p></body>")

    const domPoint = domPointFromCharacterCount(document, 0)

    expect(domPoint?.offset).toBe(0)
    expect(isText(domPoint!.node) && domPoint!.node.data).toBe(
      "Call me Ishmael.",
    )
  })

  it("clamps a count past the end of the body to its end", () => {
    const document = doc("<body><p>Call me</p><p>Ishmael.</p></body>")

    // The body is 15 characters, so each of these is at or past its end
    for (const count of [15, 16, 100]) {
      const domPoint = domPointFromCharacterCount(document, count)

      expect(domPoint && isText(domPoint.node) && domPoint.node.data).toBe(
        "Ishmael.",
      )
      expect(domPoint?.offset).toBe(8)
    }
  })

  it("marks the node an anchor is on", () => {
    const document = doc('<body><p id="here">Call me Ishmael.</p></body>')

    const domPoint = domPointFromAnchor(document, "here")

    expect(domPoint?.offset).toBe(0)
    expect(domPoint && isText(domPoint.node)).toBe(false)
    expect(domPoint && domPoint.node.nodeName).toBe("p")
  })

  it("finds no point for an anchor the document does not have", () => {
    expect(
      domPointFromAnchor(doc('<body><p id="here">x</p></body>'), "gone"),
    ).toBeNull()
  })
})

describe("from an xhtml reference", () => {
  it("resolves a character offset to a node of the resource", async () => {
    const domPointRef = await point(ebook, char(CHAPTER_1, 15))

    expect(domPointRef.rootHref).toBe(CHAPTER_1)
    expect(isText(domPointRef.domPoint.node)).toBe(true)
    expect(offset(domPointReferenceToCharacterReference(domPointRef))).toBe(15)
  })

  it("resolves an anchor to the node it marks", async () => {
    const domPointRef = await point(
      ebook,
      new UriReference(`${CHAPTER_1}#ch1-p2`),
    )

    expect(domPointRef.rootHref).toBe(CHAPTER_1)
    expect(domPointRef.domPoint.node.nodeName).toBe("p")
    expect(
      isElement(domPointRef.domPoint.node) &&
        domPointRef.domPoint.node.getAttribute("id"),
    ).toBe("ch1-p2")
  })

  it("resolves an epub cursor to a node of its spine item", async () => {
    const domPointRef = await point(
      ebook,
      new UriReference("#epubcfi(/6/4!/4/4[ch2-p1]/1:0)"),
    )

    expect(domPointRef.rootHref).toBe(CHAPTER_2)
    expect(offset(domPointReferenceToCharacterReference(domPointRef))).toBe(11)
  })

  it("resolves a crengine xpointer to a node of its spine item", async () => {
    const domPointRef = await point(
      ebook,
      new UriReference(
        "#crengine(/body[1]/DocFragment[2]/body[1]/p[1]/text()[1].4)",
      ),
    )

    expect(domPointRef.rootHref).toBe(CHAPTER_2)
    expect(offset(domPointReferenceToCharacterReference(domPointRef))).toBe(15)
  })

  it("defaults to char=0 when no fragment provided", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)
    const domPointRef = await domPointReferenceFromXhtmlReferences(epub, [
      new UriReference(CHAPTER_1),
    ])

    expect(domPointRef?.domPoint.offset).toBe(0)
    expect(domPointRef?.domPoint.node.textContent).toBe("Chapter One")
  })

  it("has nothing to say about no references at all", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    expect(await domPointReferenceFromXhtmlReferences(epub, [])).toBeNull()
  })
})

describe("to a character reference", () => {
  it("is written on the resource the point belongs to", async () => {
    const domPointRef = await point(ebook, char(CHAPTER_2, 5))

    const ref = domPointReferenceToCharacterReference(domPointRef)

    expect(ref?.hrefPathname).toBe(CHAPTER_2)
    expect(offset(ref)).toBe(5)
  })

  it("keeps a point at the end of the resource", async () => {
    // Chapter two is 36 counted characters, an 11 character title and a 25
    // character paragraph, so 36 is the position its last character ends at
    const domPointRef = await point(ebook, char(CHAPTER_2, 36))

    expect(offset(domPointReferenceToCharacterReference(domPointRef))).toBe(36)
  })

  it("finds no offset for a node of another document", async () => {
    const domPointRef = await point(ebook, char(CHAPTER_1, 15))
    const elsewhere = await point(ebook, char(CHAPTER_2, 5))

    expect(
      domPointReferenceToCharacterReference({
        ...domPointRef,
        domPoint: elsewhere.domPoint,
      }),
    ).toBeNull()
  })
})

describe("to an anchor reference", () => {
  it("uses the id the point is inside", async () => {
    const domPointRef = await point(ebook, char(CHAPTER_1, 30))

    expect(
      domPointReferenceToAnchorReference(domPointRef)?.fragment.toString(),
    ).toBe("#ch1-p2")
  })

  it("uses the nearest preceding id when nothing enclosing has one", async () => {
    const domPointRef = await point(firstOnlyEbook, char(CHAPTER_1, 40))

    expect(
      domPointReferenceToAnchorReference(domPointRef)?.fragment.toString(),
    ).toBe("#ch1-p1")
  })

  it("skips an id that is not an anchor candidate", async () => {
    const domPointRef = await point(ebook, char(CHAPTER_1, 30))

    expect(
      domPointReferenceToAnchorReference(domPointRef, (anchor) =>
        ["ch1-p1"].includes(anchor),
      )?.fragment.toString(),
    ).toBe("#ch1-p1")
  })

  it("finds no anchor among unrelated candidates", async () => {
    const domPointRef = await point(ebook, char(CHAPTER_1, 30))

    expect(
      domPointReferenceToAnchorReference(domPointRef, () => false),
    ).toBeNull()
  })
})

describe("to an epub cursor", () => {
  it("addresses the point", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)
    const domPointRef = await point(ebook, char(CHAPTER_1, 15))

    const ref = await domPointReferenceToEpubCfiReference(epub, domPointRef)

    expect(ref?.fragment.toString()).toMatch(/\/4\[ch1-p1\]\/1:4\)$/)
  })

  it("addresses the spine item the point is in", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    const first = await domPointReferenceToEpubCfiReference(
      epub,
      await point(ebook, char(CHAPTER_1, 5)),
    )
    const second = await domPointReferenceToEpubCfiReference(
      epub,
      await point(ebook, char(CHAPTER_2, 5)),
    )

    expect(first?.fragment.toString()).toMatch(/^#epubcfi\(\/6\/2!/)
    expect(second?.fragment.toString()).toMatch(/^#epubcfi\(\/6\/4!/)
  })

  it("ignores a point in a resource the book does not have", async () => {
    using second = await Epub.using(MemoryAdapter).from(secondEbook)

    const domPointRef = await point(secondEbook, char(CHAPTER_1, 15))

    expect(
      await domPointReferenceToEpubCfiReference(second, {
        ...domPointRef,
        rootHref: "OEBPS/Text/gone.xhtml",
      }),
    ).toBeNull()
  })
})

describe("to a crengine xpointer", () => {
  it("addresses the point", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)
    const domPointRef = await point(ebook, char(CHAPTER_1, 15))

    const ref = await domPointReferenceToCrengineXPointerReference(
      epub,
      domPointRef,
    )

    expect(ref?.fragment.toString()).toMatch(/\/p\[1\]\/text\(\)\[1\]\.4\)$/)
  })

  it("uses one document fragment per spine item", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)

    const first = await domPointReferenceToCrengineXPointerReference(
      epub,
      await point(ebook, char(CHAPTER_1, 15)),
    )
    const second = await domPointReferenceToCrengineXPointerReference(
      epub,
      await point(ebook, char(CHAPTER_2, 15)),
    )

    expect(first?.fragment.toString()).toMatch(/DocFragment\[1\]/)
    expect(second?.fragment.toString()).toMatch(/DocFragment\[2\]/)
  })

  it("ignores a point in a spine item the book does not have", async () => {
    using epub = await Epub.using(MemoryAdapter).from(ebook)
    const domPointRef = await point(ebook, char(CHAPTER_1, 15))

    expect(
      await domPointReferenceToCrengineXPointerReference(epub, {
        ...domPointRef,
        rootHref: "OEBPS/Text/gone.xhtml",
      }),
    ).toBeNull()
  })
})

describe("between two epubs of a book", () => {
  it("keeps the character offset", async () => {
    using second = await Epub.using(MemoryAdapter).from(secondEbook)
    using plain = await Epub.using(MemoryAdapter).from(ebook)

    const domPointRef = await point(secondEbook, char(CHAPTER_1, 15))
    const converted = await convertEpubDomPointReference(
      second,
      plain,
      domPointRef,
    )

    expect(offset(domPointReferenceToCharacterReference(converted!))).toBe(15)
    expect(converted!.rootHref).toBe(CHAPTER_1)
  })

  it("round trips", async () => {
    using second = await Epub.using(MemoryAdapter).from(secondEbook)
    using plain = await Epub.using(MemoryAdapter).from(ebook)

    const fromSecond = await point(secondEbook, char(CHAPTER_2, 7))
    const there = await convertEpubDomPointReference(second, plain, fromSecond)
    const back = await convertEpubDomPointReference(plain, second, there!)

    expect(offset(domPointReferenceToCharacterReference(back!))).toBe(7)
  })

  it("has nothing to convert for a resource the other archive lacks", async () => {
    using second = await Epub.using(MemoryAdapter).from(secondEbook)
    using plain = await Epub.using(MemoryAdapter).from(ebook)

    const domPointRef = await point(secondEbook, char(CHAPTER_1, 15))

    await expect(
      convertEpubDomPointReference(second, plain, {
        ...domPointRef,
        rootHref: "OEBPS/Text/gone.xhtml",
      }),
    ).rejects.toThrow()
  })
})
