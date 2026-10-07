import { describe, expect, it } from "vitest"

import { resolveXPointer } from "../index.ts"

import { label, parseDoc } from "./support.ts"

// crengine fills an id→node map while parsing (lvtinydom.cpp:3830), and `#something` looks up
// that map rather than walking a path. What it indexes is the `id` attribute of any element
// and, oddly, the `name` attribute of an `<a>` — and the last entry written for a value wins,
// so a repeated id resolves to the last one in document order.

const doc = parseDoc(
  '<body><div id="box"><p id="x">first</p><a id="link" name="anchor">b</a>' +
    '<a name="onlyName">c</a><p name="notAnAnchor">d</p><section><p id="x">second</p></section></div></body>',
)

describe("resolveXPointer with an #id", () => {
  it("finds an element by its id", () => {
    expect(label(resolveXPointer(doc, "#box"))).toBe("box@-1")
    expect(resolveXPointer(doc, "#box")?.node.textContent).toBe(
      "firstbcdsecond",
    )
  })

  it("finds an <a> by its name, and nothing else by its name", () => {
    expect(resolveXPointer(doc, "#anchor")?.node.nodeName).toBe("a")
    expect(resolveXPointer(doc, "#onlyName")?.node.textContent).toBe("c")
    expect(resolveXPointer(doc, "#notAnAnchor")).toBe(null)
  })

  it("takes the last of a repeated id, because crengine overwrites while parsing", () => {
    const resolved = resolveXPointer(doc, "#x")!
    expect(resolved.node.textContent).toBe("second")
  })

  it("searches the whole document, not just below the root it was given", () => {
    // crengine resolves `#id` against the document, before the path parser and independent of
    // the node a relative path would start from.
    const inner = resolveXPointer(doc, "/body/div/section")!
    expect(label(resolveXPointer(inner.node, "#box"))).toBe("box@-1")
  })

  it("matches the id exactly", () => {
    expect(resolveXPointer(doc, "#X")).toBe(null)
    expect(resolveXPointer(doc, "#box ")).toBe(null)
    expect(resolveXPointer(doc, "#missing")).toBe(null)
  })

  it("still refuses an empty xpointer", () => {
    expect(resolveXPointer(doc, "")).toBe(null)
  })
})
