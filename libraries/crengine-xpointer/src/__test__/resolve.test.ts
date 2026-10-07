import { describe, expect, it } from "vitest"

import { resolveXPointer } from "../index.ts"

import { label, parseDoc } from "./support.ts"

// These cover what a dump of crengine's tree cannot: documents that are not crengine's
// (comments, doctypes, CDATA sections), and the argument shapes the oracle never produces.
// The tree-building half of the behaviour is covered by oracle.test.ts.

const source =
  '<body id="root"><div id="d1"><p id="p1">one</p><p id="p2">two<b id="b1">bold</b>tail</p></div><div id="d2">a<b id="b2">x</b>c</div></body>'

const doc = parseDoc(source)

describe("resolveXPointer", () => {
  it("walks element steps", () => {
    expect(label(resolveXPointer(doc, "/body/div"))).toBe("d1@-1")
    expect(label(resolveXPointer(doc, "/body[1]/div[1]/p[1]"))).toBe("p1@-1")
    expect(label(resolveXPointer(doc, "/body[1]/div[1]/p[2]"))).toBe("p2@-1")
  })

  it("takes an absent index as the first match, not as ambiguous", () => {
    // crengine returns the first match (getNodeByIndex early-returns on index == -1). The
    // legacy dialect refused an ambiguous text() instead; the normalised one does not.
    expect(label(resolveXPointer(doc, "/body/div/p"))).toBe("p1@-1")
    expect(label(resolveXPointer(doc, "/body/div/p[2]/b"))).toBe("b1@-1")
  })

  it("counts text children with text(), and all children with /N", () => {
    const p2 = "/body[1]/div[1]/p[2]"
    expect(label(resolveXPointer(doc, `${p2}/text()[1]`))).toBe("#text@-1")
    expect(resolveXPointer(doc, `${p2}/text()[2]`)?.node.textContent).toBe(
      "tail",
    )
    expect(resolveXPointer(doc, `${p2}/text()[3]`)).toBe(null)
    // /2 is the <b>, counted among all the children of <p>
    expect(label(resolveXPointer(doc, `${p2}/2`))).toBe("b1@-1")
    expect(label(resolveXPointer(doc, `${p2}/1`))).toBe("#text@-1")
  })

  it("indexes from 1, so [0] matches nothing", () => {
    expect(resolveXPointer(doc, "/body[1]/div[1]/p[0]")).toBe(null)
    expect(resolveXPointer(doc, "/0")).toBe(null)
  })

  it("returns a caret as an offset, and a bare path as -1", () => {
    const p2 = "/body[1]/div[1]/p[2]/text()[2]"
    expect(label(resolveXPointer(doc, `${p2}.0`))).toBe("#text@0")
    expect(label(resolveXPointer(doc, `${p2}.2`))).toBe("#text@2")
    // "tail" is four characters; the caret may sit after the last one, but no further.
    expect(label(resolveXPointer(doc, `${p2}.4`))).toBe("#text@4")
    expect(resolveXPointer(doc, `${p2}.5`)).toBe(null)
    expect(label(resolveXPointer(doc, p2))).toBe("#text@-1")
  })

  it("counts an element's children, not its text length, for a caret", () => {
    // <p> has three children: "two", <b>, "tail"
    const p2 = "/body[1]/div[1]/p[2]"
    expect(label(resolveXPointer(doc, `${p2}.3`))).toBe("p2@3")
    expect(resolveXPointer(doc, `${p2}.4`)).toBe(null)
    expect(label(resolveXPointer(doc, "/body[1]/div[1]/p[1].1"))).toBe("p1@1")
    // a text child of a <p> is one child, whatever its length
    expect(resolveXPointer(doc, "/body[1]/div[1]/p[1].2")).toBe(null)
  })

  it("starts below the root, which is never named", () => {
    expect(label(resolveXPointer(doc, "/1"))).toBe("root@-1")
    expect(label(resolveXPointer(doc, "/body[1]"))).toBe("root@-1")
    // …so the root's own name is not special: this looks for a <body> under <body>.
    expect(resolveXPointer(doc, "/body[1]/body[1]")).toBe(null)
    expect(label(resolveXPointer(doc, "/1/1"))).toBe("d1@-1")
  })

  it("can be rooted at a node other than the document", () => {
    const div = resolveXPointer(doc, "/body/div")!
    expect(label(resolveXPointer(div.node, "/p[2]/text()[1]"))).toBe("#text@-1")
    expect(resolveXPointer(div.node, "/div[1]")).toBe(null)
  })

  it("resolves nothing that is malformed or off the end", () => {
    for (const xpointer of [
      "",
      "/",
      "body",
      "/nope",
      "/body[1]/div[9]",
      "/body[1]/div[1]/p[1]/text()[1].99",
      "/body[1]/div[1]/p[1]x",
    ]) {
      expect(resolveXPointer(doc, xpointer), xpointer).toBe(null)
    }
  })

  describe("against a document crengine could not have produced", () => {
    it("ignores the node types crengine has no callback for", () => {
      // LVXMLParserCallback has no comment, PI or doctype callback, so those children never
      // exist in crengine's tree and never take part in an index here either.
      const withComment = parseDoc(
        "<body><!-- skip me --><p>a</p><!-- and me --><p>b</p></body>",
      )
      expect(label(resolveXPointer(withComment, "/1"))).toBe("body@-1")
      expect(label(resolveXPointer(withComment, "/1/1"))).toBe("p@-1")
      expect(label(resolveXPointer(withComment, "/1/2"))).toBe("p@-1")
      expect(label(resolveXPointer(withComment, "/body/p[2]"))).toBe("p@-1")
    })

    it("ignores a doctype when numbering the document's children", () => {
      const withDoctype = parseDoc("<!DOCTYPE html><body><p>a</p></body>")
      expect(label(resolveXPointer(withDoctype, "/1"))).toBe("body@-1")
    })

    it("treats a CDATA section as the text node crengine would have made of it", () => {
      // crengine's parser hands CDATA content to the document writer as text, so it takes
      // part in the text() sequence; @xmldom/xmldom keeps it as a node of its own type.
      const cdata = parseDoc("<body><p>a<![CDATA[b]]>c</p></body>")
      expect(
        resolveXPointer(cdata, "/body/p/text()[1]")?.node.textContent,
      ).toBe("a")
      expect(
        resolveXPointer(cdata, "/body/p/text()[2]")?.node.textContent,
      ).toBe("b")
      expect(resolveXPointer(cdata, "/body/p/text()[2].1")?.offset).toBe(1)
      expect(resolveXPointer(cdata, "/body/p/text()[2].2")).toBe(null)
      expect(
        resolveXPointer(cdata, "/body/p/text()[3]")?.node.textContent,
      ).toBe("c")
      expect(resolveXPointer(cdata, "/body/p/text()[4]")).toBe(null)
    })
  })
})
