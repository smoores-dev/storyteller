import assert from "node:assert"
import { describe, it } from "node:test"

import { FootnoteNode, Mark, Node, Root, TextNode } from "../model.ts"
import {
  addMark,
  inlineFootnotes,
  liftText,
  replaceFootnotes,
} from "../transform.ts"

void describe("addMark", () => {
  void it("should add a mark", () => {
    const result = addMark(
      new Root([new Node("p", {}, [new TextNode("Hello, world!")])]),
      1,
      14,
      new Mark("span", { id: "test" }),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [
          new TextNode("Hello, world!", [new Mark("span", { id: "test" })]),
        ]),
      ]),
    )
  })

  void it("should add a mark at the start of a text node", () => {
    const result = addMark(
      new Root([new Node("p", {}, [new TextNode("Hello, world!")])]),
      1,
      7,
      new Mark("span", { id: "test" }),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [
          new TextNode("Hello,", [new Mark("span", { id: "test" })]),
          new TextNode(" world!"),
        ]),
      ]),
    )
  })

  void it("should add a mark at the end of a text node", () => {
    const result = addMark(
      new Root([new Node("p", {}, [new TextNode("Hello, world!")])]),
      7,
      14,
      new Mark("span", { id: "test" }),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [
          new TextNode("Hello,"),
          new TextNode(" world!", [new Mark("span", { id: "test" })]),
        ]),
      ]),
    )
  })

  void it("should add a mark within a text node", () => {
    const result = addMark(
      new Root([new Node("p", {}, [new TextNode("Hello, world!")])]),
      4,
      10,
      new Mark("span", { id: "test" }),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [
          new TextNode("Hel"),
          new TextNode("lo, wo", [new Mark("span", { id: "test" })]),
          new TextNode("rld!"),
        ]),
      ]),
    )
  })

  void it("should preserve existing marks", () => {
    const result = addMark(
      new Root([
        new Node("p", {}, [
          new TextNode("Hello, world!", [new Mark("span", { class: "red" })]),
        ]),
      ]),
      4,
      10,
      new Mark("span", { id: "test" }),
    )

    assert.deepStrictEqual(
      result,
      new Root([
        new Node("p", {}, [
          new TextNode("Hel", [new Mark("span", { class: "red" })]),
          new TextNode("lo, wo", [
            new Mark("span", { id: "test" }),
            new Mark("span", { class: "red" }),
          ]),
          new TextNode("rld!", [new Mark("span", { class: "red" })]),
        ]),
      ]),
    )
  })
})

void describe("liftText", () => {
  void it("should lift test out of nested docs", () => {
    const { result } = liftText(
      new Root([
        new Node("div", {}, [
          new Node("p", {}, [new TextNode("This is a sentence.")]),
          new Node("p", {}, [new TextNode("This is a second sentence.")]),
          new Node("p", {}, [new TextNode("This is a third sentence.")]),
        ]),
      ]),
    )

    assert.deepStrictEqual(
      result,
      "This is a sentence.\nThis is a second sentence.\nThis is a third sentence.\n",
    )
  })

  void it("should produce a valid mapping", () => {
    const { mapping } = liftText(
      new Root([
        new Node("div", {}, [
          new Node("p", {}, [new TextNode("This is a sentence.")]),
          new Node("p", {}, [new TextNode("This is a second sentence.")]),
          new Node("p", {}, [new TextNode("This is a third sentence.")]),
        ]),
      ]),
    )

    const cursor = mapping.cursor()

    assert.deepStrictEqual(cursor.map(2), 0)
    assert.deepStrictEqual(cursor.map(21), 19)
    // This is intentional: the inserted newlines are
    // meant to be stripped out later, so nodes
    // end up directly abutting each other, with no
    // newline between
    assert.deepStrictEqual(cursor.map(23), 19)
    assert.deepStrictEqual(cursor.map(49), 45)
    assert.deepStrictEqual(cursor.map(51), 45)
  })

  void it("should insert newlines with trailing atoms", () => {
    const { result } = liftText(
      new Root([
        new Node("h1", {}, [
          new TextNode("Chapter 1."),
          new Node("br"),
          new Node("img", { src: "../images/cn.png" }),
        ]),
      ]),
    )

    assert.deepStrictEqual(result, "Chapter 1.\n")
  })

  void it("should handle inter-block whitespace", () => {
    const { result, mapping } = liftText(
      new Root([
        new Node("p", {}, [new TextNode("\n    This is a sentence.\n")]),
        new TextNode("\n"),
        new Node("p", {}, [new TextNode("\n    This is a second sentence.\n")]),
      ]),
    )

    assert.strictEqual(
      result,
      "This is a sentence. \nThis is a second sentence. \n",
    )

    const cursor = mapping.cursor()

    assert.strictEqual(cursor.map(6), 0)
    assert.strictEqual(cursor.map(25), 19)
    assert.strictEqual(cursor.map(34), 20)
  })
})

void describe("inlineFootnotes/replaceFootnotes", () => {
  void it("should handle a round trip", () => {
    const original = new Root([
      new Node("h1", {}, [new TextNode("Chapter 1.")]),
      new Node("p", {}, [
        new TextNode("Hello, world!"),
        new TextNode("1", [
          new Mark("a", {
            "epub:type": "noteref",
            href: "#footnote",
          }),
        ]),
      ]),
      new Node("p", {}, [new TextNode("Goodbye, world!")]),
      new FootnoteNode("aside", { "epub:type": "footnote", id: "footnote" }, [
        new Node("p", {}, [new TextNode("Footnote content")]),
      ]),
    ])

    const inlined = inlineFootnotes(original)

    assert.deepStrictEqual(
      inlined.root,
      new Root([
        new Node("h1", {}, [new TextNode("Chapter 1.")]),
        new Node("p", {}, [
          new TextNode("Hello, world!"),
          new FootnoteNode(
            "aside",
            { "epub:type": "footnote", id: "footnote" },
            [new Node("p", {}, [new TextNode("Footnote content")])],
          ),
        ]),
        new Node("p", {}, [new TextNode("Goodbye, world!")]),
        new Node("aside"),
      ]),
    )

    const replaced = replaceFootnotes(
      original,
      inlined.root,
      inlined.footnotePairs,
      inlined.mapping,
    )

    assert.deepStrictEqual(replaced, original)
  })

  void it("should handle multiple footnotes", () => {
    const original = new Root([
      new Node("h1", {}, [new TextNode("Chapter 1.")]),
      new Node("p", {}, [
        new TextNode("Hello, world!"),

        new TextNode("1", [
          new Mark("a", {
            "epub:type": "noteref",
            href: "#footnote1",
          }),
        ]),
      ]),
      new Node("p", {}, [
        new TextNode("Goodbye, world!"),
        new TextNode("2", [
          new Mark("a", {
            "epub:type": "noteref",
            href: "#footnote2",
          }),
        ]),
      ]),
      new Node("div", { "epub:type": "footnotes" }, [
        new FootnoteNode("div", { "epub:type": "footnote", id: "footnote1" }, [
          new Node("p", {}, [new TextNode("Footnote one")]),
        ]),
        new FootnoteNode("div", { "epub:type": "footnote", id: "footnote2" }, [
          new Node("p", {}, [new TextNode("Footnote two")]),
        ]),
      ]),
    ])

    const inlined = inlineFootnotes(original)

    assert.deepStrictEqual(
      inlined.root,
      new Root([
        new Node("h1", {}, [new TextNode("Chapter 1.")]),
        new Node("p", {}, [
          new TextNode("Hello, world!"),
          new FootnoteNode(
            "div",
            { "epub:type": "footnote", id: "footnote1" },
            [new Node("p", {}, [new TextNode("Footnote one")])],
          ),
        ]),
        new Node("p", {}, [
          new TextNode("Goodbye, world!"),
          new FootnoteNode(
            "div",
            { "epub:type": "footnote", id: "footnote2" },
            [new Node("p", {}, [new TextNode("Footnote two")])],
          ),
        ]),
        new Node("div", { "epub:type": "footnotes" }, [
          new Node("div"),
          new Node("div"),
        ]),
      ]),
    )

    const replaced = replaceFootnotes(
      original,
      inlined.root,
      inlined.footnotePairs,
      inlined.mapping,
    )

    assert.deepStrictEqual(replaced, original)
  })
})
