/** @jsxImportSource @storyteller-platform/epub */
import { describe, expect, it } from "vitest"

import { Fragment } from "../jsx-runtime.ts"
import { NS, parse, serialize } from "../xml.ts"

function body() {
  const document = parse(
    `<html xmlns="${NS.xhtml}"><head><title>t</title></head><body></body></html>`,
    "application/xhtml+xml",
  )
  const b = document.getElementsByTagName("body").item(0)
  if (!b) throw new Error("no body")
  return b
}

function countNeedles(haystack: string, needle: RegExp): number {
  return (haystack.match(needle) ?? []).length
}

describe("jsx", () => {
  it("builds an unprefixed element with its attributes", () => {
    const item = (
      <item id="c1" href="c.xhtml" media-type="application/xhtml+xml" />
    )

    expect(item.nodeName).toBe("item")
    expect(item.getAttribute("id")).toBe("c1")
    expect(item.getAttribute("media-type")).toBe("application/xhtml+xml")
  })

  it("resolves a namespace prefix in the element name", () => {
    const title = <dc:title>Moby Dick</dc:title>

    expect(title.namespaceURI).toBe(NS.dc)
    expect(title.localName).toBe("title")
    expect(title.textContent).toBe("Moby Dick")
  })

  it("binds the namespace an xmlns attribute declares", () => {
    // The class of bug where the element reports no namespace in memory, gets
    // re-declared over the top of its own xmlns on the way out, and stops
    // parsing: `Attribute xmlns redefined`.
    const svg = <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" />

    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")

    const out = serialize(svg)
    expect(countNeedles(out, / xmlns="/g)).toBe(1)
    expect(() => parse(out, "image/svg+xml")).not.toThrow()
  })

  it("emits prefixed attributes that survive a round trip", () => {
    const nav = <nav epub:type="toc">Contents</nav>

    const out = serialize(nav)
    const reparsed = parse(out, "application/xhtml+xml").documentElement
    if (!reparsed) throw new Error("reparsed document has no document element")
    expect(reparsed.getAttribute("epub:type")).toBe("toc")
    // Re-parsing under the XHTML media type implies the XHTML default namespace
    // for the document element, so an element serialized on its own does not
    // come back namespace-less. Round-tripping a whole document is unaffected.
    expect(reparsed.namespaceURI).toBe(NS.xhtml)
  })

  it("drops null, undefined and false children but keeps numbers", () => {
    const p = (
      <p>
        {null}a{false}
        {undefined}
        {"b"}
        {3}
      </p>
    )

    expect(p.textContent).toBe("ab3")
    expect(p.childNodes.length).toBe(3)
  })

  it("nests children", () => {
    const manifest = (
      <manifest>
        <item id="a" />
        <item id="b" />
      </manifest>
    )

    expect(
      Array.from(manifest.children).map((c) => c.getAttribute("id")),
    ).toEqual(["a", "b"])
  })

  it("flattens array children", () => {
    const items = [<item id="a" />, <item id="b" />]
    const manifest = <manifest>{items}</manifest>

    expect(manifest.children.length).toBe(2)
  })

  it("omits attributes whose value is absent", () => {
    const href: string | undefined = undefined
    const item = <item id="a" href={href} properties={false} />

    expect(item.hasAttribute("href")).toBe(false)
    expect(item.hasAttribute("properties")).toBe(false)
    expect(item.hasAttribute("id")).toBe(true)
  })

  it("writes true as an empty value and stringifies numbers", () => {
    const item = <item id="a" level={2} properties="cover-image" linear="yes" />

    expect(item.getAttribute("level")).toBe("2")
    expect(item.getAttribute("id")).toBe("a")

    const flagged = <item hidden={true} />
    expect(flagged.hasAttribute("hidden")).toBe(true)
    expect(flagged.getAttribute("hidden")).toBe("")
  })

  it("ignores key", () => {
    const items = [<li key="one">A</li>, <li key="two">B</li>]
    const ol = <ol>{items}</ol>

    expect(ol.children.length).toBe(2)
    expect(ol.children.item(0)?.hasAttribute("key")).toBe(false)
  })
})

describe("Fragment", () => {
  it("yields its children without contributing an element", () => {
    const fragment = (
      <>
        <dc:title>Title</dc:title>
        <dc:language>en</dc:language>
      </>
    )

    expect(Array.isArray(fragment)).toBe(true)
    if (!Array.isArray(fragment)) return
    expect(fragment.length).toBe(2)
  })

  it("splices into a parent leaving no fragment node behind", () => {
    const metadata = (
      <metadata>
        {
          <>
            <dc:a />
            <dc:b />
          </>
        }
      </metadata>
    )

    expect(metadata.children.length).toBe(2)
    const out = serialize(metadata)
    expect(out).not.toContain("document-fragment")
  })

  it("is callable directly", () => {
    const children = Fragment({ children: [<item id="a" />, null] })
    expect(children.length).toBe(1)
  })
})

describe("insertion", () => {
  it("accepts JSX-built elements into a parsed document", async () => {
    const { insert } = await import("../xml.ts")
    const target = body()

    insert(
      target,
      <p epub:type="storyteller:sentence-span">Call me Ishmael.</p>,
    )

    const out = serialize(target.ownerDocument!)
    const reparsed = parse(out, "application/xhtml+xml")
    const p = reparsed.getElementsByTagName("p").item(0)
    expect(p?.getAttribute("epub:type")).toBe("storyteller:sentence-span")
    expect(countNeedles(out, /xmlns:epub=/g)).toBe(1)
  })
})
