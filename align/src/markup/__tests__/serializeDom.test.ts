import assert from "node:assert"
import { describe, it } from "node:test"

import { Epub } from "@storyteller-platform/epub"

import { Mark, Node, Root, TextNode } from "../model.ts"
import { serializeDom } from "../serializeDom.ts"

void describe("serializeDom", () => {
  void it("should serialize nested DOM", () => {
    const result = serializeDom(
      new Root([new Node("p", {}, [new TextNode("Hello, world!")])]),
    )

    assert.deepStrictEqual(result, [
      Epub.createXmlElement("p", {}, [Epub.createXmlTextNode("Hello, world!")]),
    ])
  })

  void it("should serialize nested marks", () => {
    const result = serializeDom(
      new Root([
        new Node("p", {}, [
          new TextNode("Hello, world!", [new Mark("strong"), new Mark("em")]),
        ]),
      ]),
    )

    assert.deepStrictEqual(result, [
      Epub.createXmlElement("p", {}, [
        Epub.createXmlElement("strong", {}, [
          Epub.createXmlElement("em", {}, [
            Epub.createXmlTextNode("Hello, world!"),
          ]),
        ]),
      ]),
    ])
  })

  void it("should join adjacent marks", () => {
    const result = serializeDom(
      new Root([
        new Node("p", {}, [
          new TextNode("Hello,", [new Mark("strong"), new Mark("em")]),
          new TextNode(" world!", [new Mark("strong")]),
        ]),
      ]),
    )

    assert.deepStrictEqual(result, [
      Epub.createXmlElement("p", {}, [
        Epub.createXmlElement("strong", {}, [
          Epub.createXmlElement("em", {}, [Epub.createXmlTextNode("Hello,")]),
          Epub.createXmlTextNode(" world!"),
        ]),
      ]),
    ])
  })

  void it("should preserve attributes", () => {
    const result = serializeDom(
      new Root([
        new Node("p", { id: "p1" }, [
          new TextNode("Hello, world!", [new Mark("span", { class: "red" })]),
        ]),
      ]),
    )

    assert.deepStrictEqual(result, [
      Epub.createXmlElement("p", { id: "p1" }, [
        Epub.createXmlElement("span", { class: "red" }, [
          Epub.createXmlTextNode("Hello, world!"),
        ]),
      ]),
    ])
  })

  void it("should preserve leaf nodes", () => {
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
      Epub.createXmlElement("p", {}, [
        Epub.createXmlElement("span", {}, [
          Epub.createXmlTextNode("Hello,"),
          Epub.createXmlElement("span", { class: "x-ebookmaker-pageno" }, [
            Epub.createXmlElement("a", { id: "Page_v" }),
          ]),
          Epub.createXmlTextNode(" world!"),
        ]),
      ]),
    ])
  })
})
