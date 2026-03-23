import assert from "node:assert"
import { describe, it } from "node:test"

import { Mark, Node, Root, TextNode } from "../model.ts"
import { addMark } from "../transform.ts"

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
