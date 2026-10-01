import assert from "node:assert"

import { describe, it } from "vitest"

import { x } from "@storyteller-platform/epub"

import { Mark, Node, Root, TextNode } from "../model.ts"
import { serializeDom } from "../serializeDom.ts"

describe("serializeDom", () => {
  it("should serialize nested DOM", () => {
    const result = serializeDom(
      new Root([new Node("p", {}, [new TextNode("Hello, world!")])]),
    )

    assert.deepStrictEqual(result, [x("p", {}, "Hello, world!")])
  })

  it("should serialize nested marks", () => {
    const result = serializeDom(
      new Root([
        new Node("p", {}, [
          new TextNode("Hello, world!", [new Mark("strong"), new Mark("em")]),
        ]),
      ]),
    )

    assert.deepStrictEqual(result, [
      x("p", {}, x("strong", {}, x("em", {}, "Hello, world!"))),
    ])
  })

  it("should join adjacent marks", () => {
    const result = serializeDom(
      new Root([
        new Node("p", {}, [
          new TextNode("Hello,", [new Mark("strong"), new Mark("em")]),
          new TextNode(" world!", [new Mark("strong")]),
        ]),
      ]),
    )

    assert.deepStrictEqual(result, [
      x("p", {}, x("strong", {}, x("em", {}, "Hello,"), " world!")),
    ])
  })

  it("should preserve attributes", () => {
    const result = serializeDom(
      new Root([
        new Node("p", { id: "p1" }, [
          new TextNode("Hello, world!", [new Mark("span", { class: "red" })]),
        ]),
      ]),
    )

    assert.deepStrictEqual(result, [
      x("p", { id: "p1" }, x("span", { class: "red" }, "Hello, world!")),
    ])
  })

  it("should preserve leaf nodes", () => {
    const result = serializeDom(
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

    assert.deepStrictEqual(result, [
      x(
        "p",
        {},
        x(
          "span",
          {},
          "Hello,",
          x("span", { class: "x-ebookmaker-pageno" }, x("a", { id: "Page_v" })),
          " world!",
        ),
      ),
    ])
  })
})
