import {
  ParseError,
  type Document,
  type Element,
  type Node,
} from "@xmldom/xmldom"
import { describe, expect, it } from "vitest"

import {
  adoptNamespaces,
  declareDefaultNamespace,
  findXmlChildByNameNS,
  insert,
  isCdata,
  isComment,
  isElement,
  isText,
  NS,
  parse,
  replace,
  serialize,
  x,
  type XmlDiagnostic,
} from "../xml.js"

const XML_NS = "http://www.w3.org/2000/xmlns/"
const XML_PREFIX_NS = "http://www.w3.org/XML/1998/namespace"
const OPF_NS = "http://www.idpf.org/2007/opf"
const DC_NS = "http://purl.org/dc/elements/1.1/"
const EPUB_NS = "http://www.idpf.org/2007/ops"
const XHTML_NS = "http://www.w3.org/1999/xhtml"
const SMIL_NS = "http://www.w3.org/ns/SMIL"
const NOVEL_NS = "https://storyteller-platform.dev/docs/vocabulary"

const XML = "text/xml"
const XHTML = "application/xhtml+xml"

/** Walk child nodes in document order, without relying on NodeList typing. */
function nodes(node: Node): Node[] {
  const out: Node[] = []
  for (let c = node.firstChild; c; c = c.nextSibling) out.push(c)
  return out
}

function attributesOf(
  element: Element,
): Array<{ name: string; value: string; namespaceURI: string | null }> {
  const out: Array<{
    name: string
    value: string
    namespaceURI: string | null
  }> = []
  const map = element.attributes
  for (let i = 0; i < map.length; i++) {
    const attr = map[i]
    if (attr) {
      out.push({
        name: attr.name,
        value: attr.value,
        namespaceURI: attr.namespaceURI,
      })
    }
  }
  return out
}

/** Collect the namespace declarations that appear anywhere in `xml`. */
function declarations(xml: string): string[] {
  return xml.match(/xmlns(:[A-Za-z0-9._-]+)?="[^"]*"/g) ?? []
}

function root(document: Document): Element {
  const element = document.documentElement
  if (!element) throw new Error("expected a document element")
  return element
}

/** Parse `xml` and collect every diagnostic reported at any level. */
function collect(xml: string, mediaType: string): XmlDiagnostic[] {
  const diagnostics: XmlDiagnostic[] = []
  parse(xml, mediaType, (diagnostic) => {
    diagnostics.push(diagnostic)
  })
  return diagnostics
}

describe("node type guards", () => {
  const document = parse("<p><!--c--><![CDATA[d]]>text</p>", XML)
  const children = nodes(root(document))

  it("distinguishes element, text, CDATA and comment nodes", () => {
    expect(children.map((node) => node.nodeType)).toEqual([8, 4, 3])
    const comment = children[0]!
    const cdata = children[1]!
    const text = children[2]!

    expect(isComment(comment)).toBe(true)
    expect(isCdata(comment)).toBe(false)
    expect(isText(comment)).toBe(false)
    expect(isElement(comment)).toBe(false)

    expect(isCdata(cdata)).toBe(true)
    expect(isComment(cdata)).toBe(false)
    expect(isText(cdata)).toBe(false)
    expect(isElement(cdata)).toBe(false)

    expect(isText(text)).toBe(true)
    expect(isCdata(text)).toBe(false)
    expect(isComment(text)).toBe(false)
    expect(isElement(text)).toBe(false)
  })

  it("reports isElement as the only predicate that accepts an element", () => {
    const element = root(parse("<p/>", XML))
    expect(isElement(element)).toBe(true)
    expect(isText(element)).toBe(false)
  })
})

describe("parse", () => {
  describe("well-formedness reporting", () => {
    it("reports recoverable diagnostics without throwing", () => {
      const diagnostics: XmlDiagnostic[] = []
      const document = parse("<p/>junk", XML, (diagnostic) => {
        diagnostics.push(diagnostic)
      })
      expect(root(document).nodeName).toBe("p")
      expect(
        diagnostics
          .filter((diagnostic) => diagnostic.message.includes("Extra content"))
          .map((diagnostic) => diagnostic.level),
      ).toEqual(["error"])
    })

    it("reports fatal diagnostics and then throws", () => {
      const diagnostics: XmlDiagnostic[] = []
      const run = () => {
        parse("<a>", XML, (diagnostic) => {
          diagnostics.push(diagnostic)
        })
      }
      expect(run).toThrow(ParseError)
      expect(run).toThrow(/unclosed xml tag/)
      expect(diagnostics.map((diagnostic) => diagnostic.level)).toContain(
        "fatalError",
      )
    })

    it("throws on input with no root element", () => {
      expect(() => parse("", XML)).toThrow()
    })

    it("throws on multiple root elements", () => {
      expect(() => parse("<a/><b/>", XML)).toThrow()
    })

    it("throws on an undeclared namespace prefix", () => {
      expect(() => parse("<foo:bar/>", XML)).toThrow()
    })

    it("works without an onError callback", () => {
      expect(root(parse("<p>ok</p>", XML)).textContent).toBe("ok")
    })
  })

  describe("XML syntax preservation", () => {
    it("preserves element name case", () => {
      expect(serialize(parse('<ClipPath class="c"/>', XML))).toBe(
        '<ClipPath class="c"/>',
      )
    })

    it("preserves self-closing tags", () => {
      expect(serialize(parse("<p><br/></p>", XML))).toBe("<p><br/></p>")
    })

    it("preserves comments", () => {
      expect(serialize(parse("<p><!-- keep me --></p>", XML))).toBe(
        "<p><!-- keep me --></p>",
      )
    })

    it("preserves CDATA sections", () => {
      expect(serialize(parse("<p><![CDATA[a < b]]></p>", XML))).toBe(
        "<p><![CDATA[a < b]]></p>",
      )
    })

    it("preserves processing instructions", () => {
      expect(serialize(parse('<?xml version="1.0"?>\n<p/>', XML))).toBe(
        '<?xml version="1.0"?>\n<p/>',
      )
    })

    it("resolves numeric character references", () => {
      expect(serialize(parse("<p>&#8212;</p>", XML))).toBe("<p>\u2014</p>")
    })

    it("round-trips text containing markup punctuation", () => {
      const source = "<p>a &amp; b &lt; c &gt; d</p>"
      expect(serialize(parse(source, XML))).toBe(source)
    })

    it("is stable across repeated parse and serialize cycles", () => {
      const source =
        '<?xml version="1.0"?>\n<package xmlns:dc="' +
        DC_NS +
        '"><metadata><dc:title id="t1">Moby Dick</dc:title></metadata></package>'
      const once = serialize(parse(source, XML))
      expect(serialize(parse(once, XML))).toBe(once)
    })
  })

  describe("media type selection", () => {
    it("accepts HTML entities as application/xhtml+xml", () => {
      const document = parse("<p>&nbsp;</p>", XHTML)
      expect(collect("<p>&nbsp;</p>", XHTML)).toEqual([])
      expect(root(document).textContent).toBe("\u00A0")
    })

    it("rejects HTML entities as text/xml", () => {
      expect(
        collect("<p>&nbsp;</p>", XML).map((diagnostic) => [
          diagnostic.level,
          diagnostic.message,
        ]),
      ).toEqual([["error", "entity not found:&nbsp;"]])
      // The entity survives as literal text and gets re-escaped, which is how
      // XHTML content is corrupted by the wrong media type.
      expect(serialize(parse("<p>&nbsp;</p>", XML))).toBe("<p>&amp;nbsp;</p>")
    })

    it("still reports genuinely unknown entities in XHTML", () => {
      expect(
        collect("<p>&unknownent;</p>", XHTML).map(
          (diagnostic) => diagnostic.level,
        ),
      ).toEqual(["error"])
    })
  })
})

describe("serialize", () => {
  it("writes empty elements as self-closing", () => {
    expect(serialize(x("p"))).toBe("<p/>")
    expect(serialize(x("p", {}))).toBe("<p/>")
  })

  it("escapes attribute values", () => {
    expect(serialize(x("p", { title: 'a"b<c&d' }))).toBe(
      '<p title="a&quot;b&lt;c&amp;d"/>',
    )
  })

  it("accepts a document or an element", () => {
    expect(serialize(parse("<p/>", XML))).toBe("<p/>")
    expect(serialize(x("p"))).toBe("<p/>")
  })

  it("throws when validate is set and the output cannot be re-parsed", () => {
    const document = parse("<root/>", XML)
    // An unmapped prefix with no declaration produces output that is not a
    // namespace-well-formed document.
    root(document).appendChild(x("foo:bar"))
    expect(() => serialize(document, { validate: true })).toThrow()
  })

  it("does not throw when validate is set and the output is well-formed", () => {
    const document = parse('<root xmlns:foo="' + NOVEL_NS + '"/>', XML)
    root(document).appendChild(x("foo:bar"))
    expect(serialize(document, { validate: true })).toBe(
      '<root xmlns:foo="' + NOVEL_NS + '"><foo:bar/></root>',
    )
  })
})

describe("x", () => {
  describe("element construction", () => {
    it("creates unprefixed elements with no namespace", () => {
      const element = x("p")
      expect(element.nodeName).toBe("p")
      expect(element.namespaceURI).toBe(null)
      expect(element.prefix).toBe(null)
    })

    it.each([
      ["dc:title", DC_NS, "dc"],
      ["epub:direct-source", EPUB_NS, "epub"],
      ["opf:creator", OPF_NS, "opf"],
    ])(
      "qualifies %s as %s in the %s namespace",
      (qualifiedName, uri, prefix) => {
        const element = x(qualifiedName)
        expect(element.namespaceURI).toBe(uri)
        expect(element.prefix).toBe(prefix)
        expect(element.nodeName).toBe(qualifiedName)
      },
    )

    it("maps the xml prefix to the XML namespace", () => {
      expect(x("xml:lang").namespaceURI).toBe(XML_PREFIX_NS)
    })

    it("composes nested elements", () => {
      expect(
        serialize(
          x("ul", null, x("li", { id: "1" }, "one"), x("li", null, "two")),
        ),
      ).toBe('<ul><li id="1">one</li><li>two</li></ul>')
    })

    it("rejects element names that are namespace declarations", () => {
      expect(() => x("xmlns:epub")).toThrow()
      expect(() => x("xmlns")).toThrow()
    })
  })

  describe("attributes", () => {
    it("sets plain attributes verbatim", () => {
      expect(attributesOf(x("p", { class: "c1", id: "p1" }))).toEqual([
        { name: "class", value: "c1", namespaceURI: null },
        { name: "id", value: "p1", namespaceURI: null },
      ])
    })

    it("skips attributes whose value is undefined", () => {
      const element = x("a", { href: "c.xhtml", "aria-hidden": undefined })
      expect(attributesOf(element)).toEqual([
        { name: "href", value: "c.xhtml", namespaceURI: null },
      ])
    })

    it("accepts a null or omitted attribute record", () => {
      expect(attributesOf(x("p"))).toEqual([])
      expect(attributesOf(x("p", null))).toEqual([])
    })

    it("qualifies xml: attributes without emitting a declaration", () => {
      const element = x("html", { "xml:lang": "en" })
      const lang = attributesOf(element)[0]!
      expect(lang.name).toBe("xml:lang")
      expect(lang.namespaceURI).toBe(XML_PREFIX_NS)
      // xml is bound by the spec, so it must never be declared.
      expect(declarations(serialize(element))).toEqual([])
    })

    it("emits a prefixed namespace declaration via xmlns:", () => {
      const element = x("nav", { "xmlns:epub": EPUB_NS })
      const decl = attributesOf(element)[0]!
      expect(decl.name).toBe("xmlns:epub")
      expect(decl.namespaceURI).toBe(XML_NS)
      expect(element.lookupPrefix(EPUB_NS)).toBe("epub")
      expect(element.lookupNamespaceURI("epub")).toBe(EPUB_NS)
    })

    it("emits a default namespace declaration via xmlns", () => {
      const element = x("html", { xmlns: XHTML_NS })
      const decl = attributesOf(element)[0]!
      expect(decl.name).toBe("xmlns")
      expect(decl.namespaceURI).toBe(XML_NS)
      expect(serialize(element)).toBe(
        '<html xmlns="http://www.w3.org/1999/xhtml"></html>',
      )
    })

    it("routes xmlns: to the xmlns namespace even for a mapped prefix", () => {
      // `xmlns:dc` must resolve against the `xmlns` prefix, not `dc`.
      expect(
        attributesOf(x("package", { "xmlns:dc": DC_NS }))[0]!.namespaceURI,
      ).toBe(XML_NS)
    })
  })

  describe("children", () => {
    it("converts strings to text nodes", () => {
      const child = nodes(x("p", null, "hello"))[0]!
      expect(isText(child)).toBe(true)
      expect(child.textContent).toBe("hello")
    })

    it("skips null and undefined children", () => {
      const element = x("nav", null, null, x("ol", null, "x"), undefined)
      expect(nodes(element)).toHaveLength(1)
    })

    it("appends node children in order", () => {
      const a = x("a")
      const b = x("b")
      expect(
        nodes(x("p", null, a, b)).map((child) => (child as Element).nodeName),
      ).toEqual(["a", "b"])
    })

    it("escapes text content", () => {
      expect(serialize(x("p", null, "a < b & c"))).toBe(
        "<p>a &lt; b &amp; c</p>",
      )
    })
  })
})

describe("namespace declaration placement", () => {
  it("declares prefixes once on the root of a constructed document", () => {
    const nav = x(
      "html",
      { xmlns: XHTML_NS, "xmlns:epub": EPUB_NS },
      x(
        "body",
        null,
        x(
          "nav",
          { "epub:type": "toc" },
          x(
            "ol",
            null,
            x(
              "li",
              null,
              x("a", { "epub:type": "cover", href: "c.xhtml" }, "Cover"),
            ),
          ),
        ),
      ),
    )
    const output = serialize(nav)
    expect(output).toContain('<nav epub:type="toc">')
    expect(output).toContain('<a epub:type="cover" href="c.xhtml">')
    expect(declarations(output)).toEqual([
      `xmlns="${XHTML_NS}"`,
      `xmlns:epub="${EPUB_NS}"`,
    ])
  })

  it("does not redeclare a prefix already declared by a parsed ancestor", () => {
    const document = parse(
      '<html xmlns="' +
        XHTML_NS +
        '" xmlns:epub="' +
        EPUB_NS +
        '"><body/></html>',
      XHTML,
    )
    root(document)
      .getElementsByTagName("body")[0]!
      .appendChild(x("nav", { "epub:type": "toc" }))
    expect(declarations(serialize(document))).toEqual([
      `xmlns="${XHTML_NS}"`,
      `xmlns:epub="${EPUB_NS}"`,
    ])
  })

  it("builds an OPF with a single dc declaration", () => {
    const output = serialize(
      x(
        "package",
        { "xmlns:dc": DC_NS, version: "3.0" },
        x(
          "metadata",
          null,
          x("dc:title", { id: "t1" }, "Moby Dick"),
          x("dc:creator", { id: "a1" }, "H. P. Lovecraft"),
          x("meta", { refines: "#t1", property: "title-type" }, "main"),
        ),
      ),
    )
    expect(output).toContain('<dc:title id="t1">Moby Dick</dc:title>')
    expect(declarations(output)).toEqual([`xmlns:dc="${DC_NS}"`])
  })

  it("builds a SMIL document with declarations on the root", () => {
    const output = serialize(
      x(
        "smil",
        { xmlns: SMIL_NS, "xmlns:epub": EPUB_NS, version: "3.0" },
        x(
          "body",
          null,
          x(
            "seq",
            { id: "c1_overlay", "epub:textref": "../c.xhtml" },
            x(
              "par",
              { clipBegin: "0s", clipEnd: "1s" },
              x("text", { src: "c.xhtml#s1" }),
            ),
          ),
        ),
      ),
    )
    // Attribute name case must survive qualification decisions.
    expect(output).toContain('<par clipBegin="0s" clipEnd="1s">')
    expect(declarations(output)).toEqual([
      `xmlns="${SMIL_NS}"`,
      `xmlns:epub="${EPUB_NS}"`,
    ])
  })
})

describe("unmapped namespace prefixes", () => {
  it("passes a declared prefix through to the declaration", () => {
    const output = serialize(
      x(
        "html",
        { xmlns: XHTML_NS, "xmlns:storyteller": NOVEL_NS },
        x("body", null, x("storyteller:thing", { "storyteller:role": "x" })),
      ),
    )
    expect(output).toContain('<storyteller:thing storyteller:role="x"/>')
    expect(declarations(output)).toEqual([
      `xmlns="${XHTML_NS}"`,
      `xmlns:storyteller="${NOVEL_NS}"`,
    ])
  })

  it("leaves constructed nodes with an unmapped prefix unqualified in memory", () => {
    expect(x("storyteller:thing").namespaceURI).toBe(null)
  })

  it("resolves a declared unmapped prefix on re-parse", () => {
    const document = parse(
      serialize(
        x(
          "html",
          { xmlns: XHTML_NS, "xmlns:storyteller": NOVEL_NS },
          x("storyteller:thing"),
        ),
      ),
      XHTML,
    )
    expect(
      document.getElementsByTagName("storyteller:thing")[0]?.namespaceURI,
    ).toBe(NOVEL_NS)
  })

  it("produces output that cannot be re-parsed when the prefix is undeclared", () => {
    const output = serialize(
      x("html", { xmlns: XHTML_NS }, x("storyteller:thing")),
    )
    expect(() => parse(output, XML)).toThrow()
  })
})

describe("owner document", () => {
  it("creates all constructed nodes in one shared document", () => {
    expect(x("a").ownerDocument).toBe(x("dc:title").ownerDocument)
  })

  it("moves a node when it is appended a second time", () => {
    const shared = x("li")
    const first = x("ul", null, shared)
    const second = x("ul", null, shared)
    expect(serialize(first)).toBe("<ul/>")
    expect(serialize(second)).toBe("<ul><li/></ul>")
  })

  it("appends constructed nodes into a parsed document", () => {
    const document = parse(
      '<package xmlns:dc="' + DC_NS + '"><metadata/></package>',
      XML,
    )
    const title = x("dc:title", null, "Moby Dick")
    root(document).getElementsByTagName("metadata")[0]!.appendChild(title)
    expect(serialize(document)).toBe(
      '<package xmlns:dc="' +
        DC_NS +
        '"><metadata><dc:title>Moby Dick</dc:title></metadata></package>',
    )
  })

  it("does not transfer ownerDocument when appending into another document", () => {
    // xmldom inserts cross-document nodes without adopting them, so a node
    // appended by `x()` keeps the shared scratch document as its owner. Tree
    // traversal and serialization are unaffected; only ownerDocument is stale.
    const document = parse("<package><metadata/></package>", XML)
    const title = x("dc:title", null, "Moby Dick")
    const scratch = title.ownerDocument
    root(document).getElementsByTagName("metadata")[0]!.appendChild(title)
    expect(title.ownerDocument).toBe(scratch)
    expect(title.ownerDocument).not.toBe(document)
  })
})

/**
 * Paths to every element that has no namespace, so that a "nothing left
 * anonymous" assertion names the element that missed out.
 */
function anonymousPaths(element: Element, prefix = ""): string[] {
  const here = prefix ? `${prefix}/${element.nodeName}` : element.nodeName
  const out = element.namespaceURI ? [] : [here]
  for (const child of Array.from(element.children)) {
    out.push(...anonymousPaths(child, here))
  }
  return out
}

function opfDocument(): Document {
  return parse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="${NS.opf}" xmlns:dc="${NS.dc}" version="3.0"><metadata/><manifest/><spine/></package>`,
    "text/xml",
  )
}

function rootChild(document: Document, localName: string): Element {
  const root = document.documentElement
  if (!root) throw new Error("no document element")
  const found = Array.from(root.children).find(
    (el) => el.localName === localName,
  )
  if (!found) throw new Error(`no ${localName} element`)
  return found
}

function idsOf(parent: Element): string[] {
  return Array.from(parent.children).map((el) => el.getAttribute("id") ?? "")
}

describe("adoptNamespaces", () => {
  it("gives an inserted subtree the namespace of the parent it was added to", () => {
    const document = opfDocument()
    const manifest = rootChild(document, "manifest")

    const item = x("item", { id: "a" }, x("nested"))
    manifest.appendChild(item)
    expect(anonymousPaths(item)).toEqual(["item", "item/nested"])

    adoptNamespaces(item)

    expect(anonymousPaths(item)).toEqual([])
    expect(item.namespaceURI).toBe(NS.opf)
    const nested = Array.from(item.children)[0]
    if (!nested) throw new Error("no nested element")
    expect(nested.namespaceURI).toBe(NS.opf)
  })

  it("leaves elements that arrive with their own namespace alone", () => {
    const document = opfDocument()
    const metadata = rootChild(document, "metadata")

    const contributor = x("dc:contributor", { id: "c" }, "Someone")
    metadata.appendChild(contributor)
    adoptNamespaces(contributor)

    // An OPF default namespace must not swallow a dc: element.
    expect(contributor.namespaceURI).toBe(NS.dc)
  })

  it("leaves attributes untouched", () => {
    const document = opfDocument()
    const manifest = rootChild(document, "manifest")

    const nav = x("nav", { "epub:type": "toc", id: "n" })
    manifest.appendChild(nav)
    adoptNamespaces(nav)

    const namespaces = new Map(
      Array.from(nav.attributes).map((attr) => [attr.name, attr.namespaceURI]),
    )

    // A default namespace never applies to an attribute, so `id` stays in no
    // namespace and `epub:type` keeps the namespace `x()` gave it.
    expect(namespaces.get("id")).toBeNull()
    expect(namespaces.get("epub:type")).toBe(NS.epub)
    expect(nav.getAttribute("epub:type")).toBe("toc")
  })

  it("does not change the serialized document", () => {
    // Adopting is bookkeeping only. The same tree written without adopting has
    // to produce identical bytes, otherwise this changes what is written out.
    const raw = opfDocument()
    rootChild(raw, "manifest").appendChild(x("item", { id: "a" }, x("nested")))
    const rawBytes = serialize(raw)

    const adopted = opfDocument()
    insert(rootChild(adopted, "manifest"), x("item", { id: "a" }, x("nested")))

    expect(serialize(adopted)).toBe(rawBytes)
  })

  it("has nothing to inherit when the parent is itself anonymous", () => {
    const orphan = x("wrapper")
    orphan.appendChild(x("inner"))

    adoptNamespaces(orphan)

    // Nothing above it establishes a namespace, so nothing changes.
    expect(anonymousPaths(orphan)).toEqual(["wrapper", "wrapper/inner"])
  })
})

describe("insert", () => {
  it("appends when no reference is given", () => {
    const document = opfDocument()
    const manifest = rootChild(document, "manifest")

    insert(manifest, x("item", { id: "first" }))
    insert(manifest, x("item", { id: "second" }))

    expect(idsOf(manifest)).toEqual(["first", "second"])
  })

  it("inserts before the reference node", () => {
    const document = opfDocument()
    const manifest = rootChild(document, "manifest")
    const first = insert(manifest, x("item", { id: "first" }))

    insert(manifest, x("item", { id: "early" }), first)

    expect(idsOf(manifest)).toEqual(["early", "first"])
  })

  it("adopts the enclosing namespace", () => {
    const document = opfDocument()
    const manifest = rootChild(document, "manifest")

    insert(manifest, x("item", { id: "a" }, x("nested")))

    expect(anonymousPaths(manifest)).toEqual([])
    expect(manifest.getElementsByTagNameNS(NS.opf, "item").length).toBe(1)
  })

  it("returns the inserted child", () => {
    const document = opfDocument()
    const item = insert(rootChild(document, "manifest"), x("item", { id: "a" }))
    expect(item.getAttribute("id")).toBe("a")
  })
})

describe("byte order marks", () => {
  it("accepts a BOM ahead of the XML declaration", () => {
    // Files on disk may lead with a BOM; once decoded it occupies offset 0,
    // and the declaration is no longer at the start of the document.
    const source =
      `\uFEFF<?xml version="1.0" encoding="UTF-8"?><html xmlns="${XHTML_NS}">` +
      `<head><title>t</title></head><body><p>hi</p></body></html>`

    const document = parse(source, "application/xhtml+xml")

    expect(document.documentElement?.localName).toBe("html")
    expect(document.getElementsByTagName("p").item(0)?.textContent).toBe("hi")
  })
})

describe("declareDefaultNamespace", () => {
  it("makes namespace-aware lookups see an added default namespace", () => {
    const document = parse(
      `<package xmlns:dc="${DC_NS}" version="3.0">` +
        `<metadata><dc:title>Title</dc:title></metadata><spine/></package>`,
      "text/xml",
    )
    const root = document.documentElement
    if (!root) throw new Error("no document element")

    // As read, nothing is in the OPF namespace.
    expect(findXmlChildByNameNS(OPF_NS, "metadata", root)).toBeUndefined()

    declareDefaultNamespace(root, OPF_NS)

    const metadata = findXmlChildByNameNS(OPF_NS, "metadata", root)
    if (!metadata) throw new Error("metadata not found after declaring")
    expect(metadata.namespaceURI).toBe(OPF_NS)

    // Elements already in another namespace are left alone.
    const title = findXmlChildByNameNS(DC_NS, "title", metadata)
    if (!title) throw new Error("dc:title lost its namespace")
    expect(title.namespaceURI).toBe(DC_NS)

    // The declaration is emitted once, and the result re-parses.
    const out = serialize(document)
    expect(out.match(/<package[^>]*>/)?.[0]).toContain(`xmlns="${OPF_NS}"`)
    expect(out.match(/ xmlns="/g)).toHaveLength(1)
    expect(() => parse(out, "text/xml")).not.toThrow()
  })
})

describe("replace", () => {
  it("swaps the element and adopts the new one", () => {
    const document = opfDocument()
    const manifest = rootChild(document, "manifest")
    const original = insert(manifest, x("item", { id: "old" }))

    replace(manifest, x("item", { id: "new" }), original)

    expect(idsOf(manifest)).toEqual(["new"])
    expect(anonymousPaths(manifest)).toEqual([])
  })
})
