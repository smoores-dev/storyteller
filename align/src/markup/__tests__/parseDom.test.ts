import assert from "node:assert"
import { describe, it } from "node:test"

import { Epub } from "@storyteller-platform/epub"

import { Mark, Node, Root, TextNode } from "../model.ts"
import { parseDom } from "../parseDom.ts"

void describe("parseDom", () => {
  void it("should parse hierarchical XML", () => {
    const result = parseDom([
      Epub.createXmlElement("p", {}, [
        Epub.createXmlElement("span", {}, [
          Epub.createXmlTextNode("Hello, world!"),
        ]),
      ]),
    ])

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [new TextNode("Hello, world!", [new Mark("span")])]),
      ]),
    )
  })

  void it("should parse nested marks", () => {
    const result = parseDom([
      Epub.createXmlElement("p", {}, [
        Epub.createXmlElement("strong", {}, [
          Epub.createXmlElement("em", {}, [
            Epub.createXmlTextNode("Hello, world!"),
          ]),
        ]),
      ]),
    ])

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [
          new TextNode("Hello, world!", [new Mark("strong"), new Mark("em")]),
        ]),
      ]),
    )
  })

  void it("should preserve attributes", () => {
    const result = parseDom([
      Epub.createXmlElement("p", { id: "p1" }, [
        Epub.createXmlElement("span", { class: "red" }, [
          Epub.createXmlTextNode("Hello, world!"),
        ]),
      ]),
    ])

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", { id: "p1" }, [
          new TextNode("Hello, world!", [new Mark("span", { class: "red" })]),
        ]),
      ]),
    )
  })

  void it("should preserve leaf nodes", () => {
    const result = parseDom([
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
