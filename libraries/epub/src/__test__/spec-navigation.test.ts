import type { Element } from "@xmldom/xmldom"
/**
 * EPUB 3.3 conformance: the EPUB navigation document.
 *
 * Section references are to https://www.w3.org/TR/epub-33/
 */
import { describe, expect, it } from "vitest"

import { Epub, MemoryAdapter } from "../index.tsx"
import { parse } from "../xml.ts"

import {
  REQUIRED_METADATA,
  XHTML_NS,
  buildZip,
  chapterDocument,
  createPublication,
  navDocument,
  packageXml,
  readZipEntries,
} from "./spec-support.ts"

async function navText(buffer: Buffer): Promise<string> {
  const entries = await readZipEntries(buffer)
  const nav = entries.find((entry) => entry.filename.endsWith("nav.xhtml"))
  if (!nav) throw new Error("no nav.xhtml in the archive")
  return nav.text
}

/** The `nav` elements in a navigation document, by epub:type. */
function navElements(text: string): Element[] {
  const doc = parse(text, "application/xhtml+xml")
  return Array.from(doc.getElementsByTagName("nav"))
}

function childElements(element: Element): Element[] {
  return Array.from(element.children)
}

describe("7.2 navigation document requirements", () => {
  it("produces an XHTML document in the XHTML namespace", async () => {
    const { buffer } = await createPublication()
    const doc = parse(await navText(buffer), "application/xhtml+xml")

    // "A valid EPUB navigation document MUST conform to the content conformance
    // constraints for XHTML content documents."
    expect(doc.documentElement?.localName).toBe("html")
    expect(doc.documentElement?.namespaceURI).toBe(XHTML_NS)
  })

  it("includes exactly one toc nav element", async () => {
    const { buffer } = await createPublication()
    const navs = navElements(await navText(buffer))

    // "MUST include exactly one toc nav element."
    const tocs = navs.filter((nav) => nav.getAttribute("epub:type") === "toc")
    expect(tocs).toHaveLength(1)
  })

  it("parses the generated navigation document without XML errors", async () => {
    const { buffer } = await createPublication()
    const text = await navText(buffer)

    const problems: string[] = []
    parse(text, "application/xhtml+xml", (diagnostic) => {
      problems.push(`${diagnostic.level}: ${diagnostic.message}`)
    })

    expect(problems).toEqual([])
  })
})

describe("7.3 nav element content model", () => {
  it("has at most one heading and exactly one ordered list", async () => {
    const { buffer } = await createPublication()
    const navs = navElements(await navText(buffer))

    for (const nav of navs) {
      const children = childElements(nav)
      const headings = children.filter((child) =>
        /^h[1-6]$/.test(child.nodeName),
      )
      const lists = children.filter((child) => child.nodeName === "ol")

      // Content model: h1-h6 [0 or 1], ol [exactly 1].
      expect(headings.length).toBeLessThanOrEqual(1)
      expect(lists).toHaveLength(1)
    }
  })

  it("validates the li structure of the toc recursively", async () => {
    const { buffer } = await createPublication()
    const navs = navElements(await navText(buffer))
    const toc = navs.find((nav) => nav.getAttribute("epub:type") === "toc")!

    const visited: Element[] = []
    const walk = (list: Element) => {
      for (const li of childElements(list)) {
        visited.push(li)
        for (const child of childElements(li)) {
          if (child.nodeName === "ol") walk(child)
        }
      }
    }

    const ol = childElements(toc).find((child) => child.nodeName === "ol")!
    walk(ol)

    expect(visited.length).toBeGreaterThan(0)

    // li content model: (span or a) [exactly 1], ol [conditionally required].
    for (const li of visited) {
      const children = childElements(li)
      const labels = children.filter(
        (child) => child.nodeName === "span" || child.nodeName === "a",
      )
      expect(labels).toHaveLength(1)

      const extras = children.filter(
        (child) =>
          child.nodeName !== "ol" &&
          child.nodeName !== "span" &&
          child.nodeName !== "a",
      )
      expect(extras.map((child) => child.nodeName)).toEqual([])
    }
  })

  it("gives every link a non-zero-length label", async () => {
    const { buffer } = await createPublication()
    const navs = navElements(await navText(buffer))

    const anchors = Array.from(navs).flatMap((nav) =>
      Array.from(nav.getElementsByTagName("a")),
    )
    expect(anchors.length).toBeGreaterThan(0)

    // "The child a or span element MUST provide a non-zero-length text label
    // after concatenation of all child content."
    for (const anchor of anchors) {
      expect((anchor.textContent ?? "").trim().length).toBeGreaterThan(0)
    }
  })
})

describe("7.4 nav element types", () => {
  it("declares each navigation type at most once", async () => {
    const { buffer } = await createPublication()
    const types = navElements(await navText(buffer))
      .map((nav) => nav.getAttribute("epub:type"))
      .filter((type): type is string => !!type)

    const duplicates = types.filter((type, i) => types.indexOf(type) !== i)
    // "An EPUB navigation document may contain at most one navigation aid for
    // each of these types."
    expect(duplicates).toEqual([])
  })
})

describe("7.4 navigation reading", () => {
  async function epubWithNav(nav: string) {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "content.opf": packageXml({
        metadata: REQUIRED_METADATA,
        manifest: `    <item href="nav.xhtml" id="nav" media-type="application/xhtml+xml" properties="nav"/>
    <item href="chapter1.xhtml" id="c1" media-type="application/xhtml+xml"/>
    <item href="chapter2.xhtml" id="c2" media-type="application/xhtml+xml"/>`,
        spine: `    <itemref idref="c1"/>
    <itemref idref="c2"/>`,
      }),
      "nav.xhtml": nav,
      "chapter1.xhtml": chapterDocument("One"),
      "chapter2.xhtml": chapterDocument("Two"),
    })
    return Epub.using(MemoryAdapter).from(epubBuffer)
  }

  it("reads nested table of contents entries", async () => {
    using epub = await epubWithNav(
      navDocument({
        tocItems: `    <li><a href="chapter1.xhtml">Chapter One</a>
      <ol>
        <li><a href="chapter1.xhtml#s1">Section One</a></li>
        <li><a href="chapter1.xhtml#s2">Section Two</a></li>
      </ol>
    </li>
    <li><a href="chapter2.xhtml">Chapter Two</a></li>`,
      }),
    )

    const toc = await epub.getTableOfContents()
    expect(toc?.children.map((child) => child.title)).toEqual([
      "Chapter One",
      "Chapter Two",
    ])
    expect(toc?.children[0]?.children?.map((child) => child.title)).toEqual([
      "Section One",
      "Section Two",
    ])
  })

  it("reads span group headings as unlinked entries", async () => {
    using epub = await epubWithNav(
      navDocument({
        tocItems: `    <li><span>Front Matter</span>
      <ol>
        <li><a href="chapter1.xhtml">Preface</a></li>
      </ol>
    </li>`,
      }),
    )

    const toc = await epub.getTableOfContents()
    expect(toc?.children[0]?.title).toBe("Front Matter")
    expect(toc?.children[0]?.href).toBeUndefined()
    expect(toc?.children[0]?.children?.map((child) => child.title)).toEqual([
      "Preface",
    ])
  })

  it("reads landmarks and their epub:type values", async () => {
    using epub = await epubWithNav(
      navDocument({
        extraNavs: `<nav epub:type="landmarks">
  <h2>Guide</h2>
  <ol>
    <li><a epub:type="toc" href="nav.xhtml#toc">Table of Contents</a></li>
    <li><a epub:type="bodymatter" href="chapter1.xhtml">Start Reading</a></li>
  </ol>
</nav>`,
      }),
    )

    // 7.4.4: "The epub:type attribute is REQUIRED on a element descendants of
    // the landmarks nav element."
    const landmarks = await epub.getLandmarks()
    expect(landmarks?.children.map((child) => child.title)).toEqual([
      "Table of Contents",
      "Start Reading",
    ])
    expect(landmarks?.children.map((child) => child.role)).toEqual([
      "toc",
      "bodymatter",
    ])
  })

  it("reads a page list", async () => {
    using epub = await epubWithNav(
      navDocument({
        extraNavs: `<nav epub:type="page-list">
  <h2>Pages</h2>
  <ol>
    <li><a href="chapter1.xhtml#p1">1</a></li>
    <li><a href="chapter2.xhtml#p2">2</a></li>
  </ol>
</nav>`,
      }),
    )

    const pageList = await epub.getPageList()
    expect(pageList?.children.map((child) => child.title)).toEqual(["1", "2"])
  })

  it("resolves navigation hrefs relative to the navigation document", async () => {
    const epubBuffer = await buildZip({
      "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
      "OEBPS/content.opf": packageXml({
        metadata: REQUIRED_METADATA,
        manifest: `    <item href="nav/nav.xhtml" id="nav" media-type="application/xhtml+xml" properties="nav"/>
    <item href="text/chapter1.xhtml" id="c1" media-type="application/xhtml+xml"/>`,
        spine: `    <itemref idref="c1"/>`,
      }),
      "OEBPS/nav/nav.xhtml": navDocument({
        tocItems: `    <li><a href="../text/chapter1.xhtml">Chapter One</a></li>`,
      }),
      "OEBPS/text/chapter1.xhtml": chapterDocument("One"),
    })

    using epub = await Epub.using(MemoryAdapter).from(epubBuffer)

    const toc = await epub.getTableOfContents()
    expect(toc?.children[0]?.title).toBe("Chapter One")

    // The href is relative to nav/nav.xhtml, so the resolved resource has to
    // be text/chapter1.xhtml rather than nav/chapter1.xhtml.
    const resolved = await epub.resolveHref(
      toc!.children[0]!.href!,
      "nav/nav.xhtml",
    )
    expect(resolved).toContain("text/chapter1.xhtml")
  })
})
