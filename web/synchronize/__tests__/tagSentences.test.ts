import { describe, it } from "node:test"
import { ParsedXml, XmlNode } from "../../epub"
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

  it("can tag sentences in nested textblocks", () => {
    const input = xmlParser.parse(`
<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"
      epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="en" xml:lang="en">
    
  <head>
    <link href="../styles/9781534431010.css" rel="stylesheet" type="text/css" />
    <link href="../styles/SS_global.css" rel="stylesheet" type="text/css" />
    <link rel="stylesheet" href="../../Styles/storyteller-readaloud.css" type="text/css" />
  </head>
    
  <body>
    <blockquote class="blockquotelet">
      <p class="blockno"><span aria-label="page 7" id="page_7" role="doc-pagebreak" /></p>
      <p class="blockno">Look on my works, ye mighty, and despair!</p>
      <p class="blockno1">A little joke.</p>
      <p class="blockno1"> </p>
      <p class="blockno1">Trust that I have accounted for all variables of irony.</p>
      <p class="blockno1"> </p>
      <p class="blockno1">Though I suppose if you’re unfamiliar with overanthologized works of the early Strand 6
        nineteenth century, the joke’s on me.</p>
      <p class="blockin">I hoped you’d come.</p>
    </blockquote>
  </body>
    
</html>
    `)

    const output = tagSentences(input)

    assert.strictEqual(
      xmlBuilder.build(output),
      `
<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="en" xml:lang="en">
    
  <head>
    <link href="../styles/9781534431010.css" rel="stylesheet" type="text/css"></link>
    <link href="../styles/SS_global.css" rel="stylesheet" type="text/css"></link>
    <link rel="stylesheet" href="../../Styles/storyteller-readaloud.css" type="text/css"></link>
  </head>
    
  <body>
    <blockquote class="blockquotelet">
      <p class="blockno"><span aria-label="page 7" id="page_7" role="doc-pagebreak"></span></p>
      <p class="blockno"><span id="sentence0">Look on my works, ye mighty, and despair!</span></p>
      <p class="blockno1"><span id="sentence1">A little joke.</span></p>
      <p class="blockno1"> </p>
      <p class="blockno1"><span id="sentence2">Trust that I have accounted for all variables of irony.</span></p>
      <p class="blockno1"> </p>
      <p class="blockno1"><span id="sentence3">Though I suppose if you’re unfamiliar with overanthologized works of the early Strand 6
        nineteenth century, the joke’s on me.</span></p>
      <p class="blockin"><span id="sentence4">I hoped you’d come.</span></p>
    </blockquote>
  </body>
    
</html>`,
    )
  })

  it("can tag sentences that cross textblock boundaries", () => {
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
        shore,
    </p>
    <p>
        I thought I would sail about a little and see the watery part of
        the world.
    </p>
  </body>
</html>
    `)

    const output = tagSentences(input)

    assert.strictEqual(
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
        shore,
    </span></p>
    <p>
        I thought I would sail about a little and see the watery part of
        the world.
    </p>
  </body>
</html>`,
    )
  })
})
