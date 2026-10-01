import assert from "node:assert"

import { describe, it } from "vitest"

import { type Element, x } from "@storyteller-platform/epub"

import { FootnoteNode, Mark, Node, Root, TextNode } from "../model.ts"
import { parseDom } from "../parseDom.ts"

/** parseDom takes the body element; the tests build a sibling forest. */
function body(children: Element[]) {
  return x("body", {}, ...children)
}

describe("parseDom", () => {
  it("should parse hierarchical XML", () => {
    const result = parseDom(body([x("p", {}, x("span", {}, "Hello, world!"))]))

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [new TextNode("Hello, world!", [new Mark("span")])]),
      ]),
    )
  })

  it("should parse nested marks", () => {
    const result = parseDom(
      body([x("p", {}, x("strong", {}, x("em", {}, "Hello, world!")))]),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [
          new TextNode("Hello, world!", [new Mark("strong"), new Mark("em")]),
        ]),
      ]),
    )
  })

  it("should preserve attributes", () => {
    const result = parseDom(
      body([
        x("p", { id: "p1" }, x("span", { class: "red" }, "Hello, world!")),
      ]),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", { id: "p1" }, [
          new TextNode("Hello, world!", [new Mark("span", { class: "red" })]),
        ]),
      ]),
    )
  })

  it("should identify footnotes and noterefs", () => {
    const result = parseDom(
      body([
        x(
          "p",
          { id: "p1" },
          "Hello, world!",
          x(
            "a",
            {
              id: "note1",
              "epub:type": "noteref",
              href: "#note1-content",
            },
            "1",
          ),
        ),
        x(
          "aside",
          {},
          x(
            "p",
            { id: "note1-content", "epub:type": "footnote" },
            x("a", { href: "#note1" }, "1"),
            "Footnote content",
          ),
        ),
      ]),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", { id: "p1" }, [
          new TextNode("Hello, world!"),
          new TextNode("1", [
            new Mark("a", {
              id: "note1",
              "epub:type": "noteref",
              href: "#note1-content",
            }),
          ]),
        ]),
        new Node("aside", {}, [
          new FootnoteNode(
            "p",
            { id: "note1-content", "epub:type": "footnote" },
            [
              new TextNode("1", [new Mark("a", { href: "#note1" })]),
              new TextNode("Footnote content"),
            ],
          ),
        ]),
      ]),
    )
  })

  it("should identify footnotes and noterefs when footnote role is missing", () => {
    const result = parseDom(
      body([
        x(
          "p",
          { id: "p1" },
          "Hello, world!",
          x(
            "a",
            {
              id: "note1",
              "epub:type": "noteref",
              href: "#note1-content",
            },
            "1",
          ),
        ),
        x(
          "aside",
          {},
          x(
            "p",
            { id: "note1-content" },
            x("a", { href: "#note1" }, "1"),
            "Footnote content",
          ),
        ),
      ]),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", { id: "p1" }, [
          new TextNode("Hello, world!"),
          new TextNode("1", [
            new Mark("a", {
              id: "note1",
              "epub:type": "noteref",
              href: "#note1-content",
            }),
          ]),
        ]),
        new Node("aside", {}, [
          new FootnoteNode(
            "p",
            { id: "note1-content", "epub:type": "footnote" },
            [
              new TextNode("1", [new Mark("a", { href: "#note1" })]),
              new TextNode("Footnote content"),
            ],
          ),
        ]),
      ]),
    )
  })

  it("should preserve leaf nodes", () => {
    const result = parseDom(
      body([
        x(
          "p",
          {},
          x(
            "span",
            {},
            "Hello,",
            x(
              "span",
              { class: "x-ebookmaker-pageno" },
              x("a", { id: "Page_v" }),
            ),
            " world!",
          ),
        ),
      ]),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [
          new TextNode("Hello,", [new Mark("span")]),
          new Node(
            "a",
            { id: "Page_v" },
            [],
            [
              new Mark("span"),
              new Mark("span", { class: "x-ebookmaker-pageno" }),
            ],
          ),
          new TextNode(" world!", [new Mark("span")]),
        ]),
      ]),
    )
  })
})
