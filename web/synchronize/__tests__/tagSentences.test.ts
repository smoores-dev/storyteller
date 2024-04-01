import { describe, it } from "node:test"
import { ParsedXml, XmlNode } from "../epub"
import { appendTextNode, tagSentences } from "../tagSentences"
import assert from "node:assert"
import { XMLBuilder, XMLParser } from "fast-xml-parser"

const xmlParser = new XMLParser({
  allowBooleanAttributes: true,
  alwaysCreateTextNode: true,
  preserveOrder: true,
  ignoreAttributes: false,
  processEntities: true,
  htmlEntities: true,
  trimValues: false,
  stopNodes: ["*.pre", "*.script"],
})

const xmlBuilder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  stopNodes: ["*.pre", "*.script"],
})

describe("appendTextNode", () => {
  it("can append text nodes to empty parents", () => {
    const input: ParsedXml = []
    appendTextNode(input, "test", [])
    assert.deepStrictEqual(input, [{ "#text": "test" }])
  })

  it("can append text nodes with marks", () => {
    const input: ParsedXml = []
    appendTextNode(input, "test", [
      { elementName: "a", attributes: { "@_href": "#" } },
    ])
    assert.deepStrictEqual(input, [
      { a: [{ "#text": "test" }], ":@": { "@_href": "#" } },
    ])
  })

  it("can wrap text nodes with sentence spans", () => {
    const input: ParsedXml = []
    appendTextNode(input, "test", [], 0)
    assert.deepStrictEqual(input, [
      { span: [{ "#text": "test" }], ":@": { "@_id": "sentence0" } },
    ])
  })

  it("can join text nodes with the same sentence ids", () => {
    const input: ParsedXml = [
      {
        span: [{ "#text": "test" } as unknown as XmlNode],
        ":@": { "@_id": "sentence0" },
      } as unknown as XmlNode,
    ]
    appendTextNode(input, "test", [], 0)
    assert.deepStrictEqual(input, [
      {
        span: [{ "#text": "test" }, { "#text": "test" }],
        ":@": { "@_id": "sentence0" },
      },
    ])
  })
})

describe("tagSentences", () => {
  it("can tag sentences", () => {
    const input = xmlParser.parse(`
<?xml version="1.0" encoding="UTF-8"?>

<html>
  <head>
    <meta charset="utf-8" />
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        Call me Ishmael. Some years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world. It is a way I have of driving off the spleen and regulating the
        circulation. Whenever I find myself growing grim about the mouth; whenever
        it is a damp, drizzly November in my soul; whenever I find myself
        involuntarily pausing before coffin warehouses, and bringing up the rear
        of every funeral I meet; and especially whenever my hypos get such an
        upper hand of me, that it requires a strong moral principle to prevent me
        from deliberately stepping into the street, and methodically knocking
        people’s hats off—then, I account it high time to get to sea as soon
        as I can.
    </p>
    <p>
        This is my substitute for pistol and ball. With a philosophical
        flourish Cato throws himself upon his sword; I quietly take to the ship.
        There is nothing surprising in this. If they but knew it, almost all men
        in their degree, some time or other, cherish very nearly the same feelings
        towards the ocean with me.
    </p>
  </body>
</html>
`)

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"></meta>
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        <span id="sentence0">Call me Ishmael.</span> <span id="sentence1">Some years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.</span> <span id="sentence2">It is a way I have of driving off the spleen and regulating the
        circulation.</span> <span id="sentence3">Whenever I find myself growing grim about the mouth; whenever
        it is a damp, drizzly November in my soul; whenever I find myself
        involuntarily pausing before coffin warehouses, and bringing up the rear
        of every funeral I meet; and especially whenever my hypos get such an
        upper hand of me, that it requires a strong moral principle to prevent me
        from deliberately stepping into the street, and methodically knocking
        people’s hats off—then, I account it high time to get to sea as soon
        as I can.</span>
    </p>
    <p>
        <span id="sentence4">This is my substitute for pistol and ball.</span> <span id="sentence5">With a philosophical
        flourish Cato throws himself upon his sword; I quietly take to the ship.</span>
        <span id="sentence6">There is nothing surprising in this.</span> <span id="sentence7">If they but knew it, almost all men
        in their degree, some time or other, cherish very nearly the same feelings
        towards the ocean with me.</span>
    </p>
  </body>
</html>`,
    )
  })

  it("can tag sentences with formatting marks", () => {
    const input = xmlParser.parse(`
<?xml version="1.0" encoding="UTF-8"?>

<html>
  <head>
    <meta charset="utf-8" />
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        Call me <strong>Ishmael</strong>. Some years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.
    </p>
  </body>
</html>
`)

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"></meta>
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        <span id="sentence0">Call me <strong>Ishmael</strong>.</span> <span id="sentence1">Some years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.</span>
    </p>
  </body>
</html>`,
    )
  })

  it("can tag sentences with formatting marks that overlap sentence boundaries", () => {
    const input = xmlParser.parse(`
<?xml version="1.0" encoding="UTF-8"?>

<html>
  <head>
    <meta charset="utf-8" />
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        Call me <strong>Ishmael. Some years ago</strong>—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.
    </p>
  </body>
</html>
`)

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"></meta>
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        <span id="sentence0">Call me <strong>Ishmael.</strong></span><strong> </strong><span id="sentence1"><strong>Some years ago</strong>—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.</span>
    </p>
  </body>
</html>`,
    )
  })

  it("can tag sentences with nested formatting marks", () => {
    const input = xmlParser.parse(`
<?xml version="1.0" encoding="UTF-8"?>

<html>
  <head>
    <meta charset="utf-8" />
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        <em>Call me <strong>Ishmael</strong>.</em> Some years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.
    </p>
  </body>
</html>
`)

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"></meta>
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        <span id="sentence0"><em>Call me </em><em><strong>Ishmael</strong></em><em>.</em></span> <span id="sentence1">Some years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.</span>
    </p>
  </body>
</html>`,
    )
  })

  it("can tag sentences with atoms", () => {
    const input = xmlParser.parse(`
<?xml version="1.0" encoding="UTF-8"?>

<html>
  <head>
    <meta charset="utf-8" />
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        Call me Ishmael. Some<img src="#"/> years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.
    </p>
  </body>
</html>
`)

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"></meta>
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        <span id="sentence0">Call me Ishmael.</span> <span id="sentence1">Some<img src="#"></img> years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.</span>
    </p>
  </body>
</html>`,
    )
  })
})
