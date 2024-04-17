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
  suppressEmptyNode: true,
})

void describe("appendTextNode", () => {
  void it("can append text nodes to empty parents", () => {
    const input: ParsedXml = []
    appendTextNode(input, "test", [], new Set())
    assert.deepStrictEqual(input, [{ "#text": "test" }])
  })

  void it("can append text nodes with marks", () => {
    const input: ParsedXml = []
    appendTextNode(
      input,
      "test",
      [{ elementName: "a", attributes: { "@_href": "#" } }],
      new Set(),
    )
    assert.deepStrictEqual(input, [
      { a: [{ "#text": "test" }], ":@": { "@_href": "#" } },
    ])
  })

  void it("can wrap text nodes with sentence spans", () => {
    const input: ParsedXml = []
    appendTextNode(input, "test", [], new Set(), 0)
    assert.deepStrictEqual(input, [
      { span: [{ "#text": "test" }], ":@": { "@_id": "sentence0" } },
    ])
  })

  void it("can join text nodes with the same sentence ids", () => {
    const input: ParsedXml = [
      {
        span: [{ "#text": "test" } as unknown as XmlNode],
        ":@": { "@_id": "sentence0" },
      } as unknown as XmlNode,
    ]
    appendTextNode(input, "test", [], new Set(), 0)
    assert.deepStrictEqual(input, [
      {
        span: [{ "#text": "test" }, { "#text": "test" }],
        ":@": { "@_id": "sentence0" },
      },
    ])
  })
})

void describe("tagSentences", () => {
  void it("can tag sentences", () => {
    const input = xmlParser.parse(/* xml */ `
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
`) as ParsedXml

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      /* xml */ `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"/>
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

  void it("can tag sentences with formatting marks", () => {
    const input = xmlParser.parse(/* xml */ `
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
`) as ParsedXml

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      /* xml */ `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"/>
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

  void it("can tag sentences with formatting marks that overlap sentence boundaries", () => {
    const input = xmlParser.parse(/* xml */ `
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
`) as ParsedXml

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      /* xml */ `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"/>
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

  void it("can tag sentences with nested formatting marks", () => {
    const input = xmlParser.parse(/* xml */ `
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
`) as ParsedXml

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      /* xml */ `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"/>
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

  void it("can tag sentences with atoms", () => {
    const input = xmlParser.parse(/* xml */ `
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
`) as ParsedXml

    const output = tagSentences(input)

    assert.deepStrictEqual(
      xmlBuilder.build(output),
      /* xml */ `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"/>
    <title>The Project Gutenberg eBook of Moby Dick; Or the Whale, by Herman Melville</title>
  </head>
  <body>
    <p>
        <span id="sentence0">Call me Ishmael.</span> <span id="sentence1">Some<img src="#"/> years ago—never mind how long precisely—having
        little or no money in my purse, and nothing particular to interest me on
        shore, I thought I would sail about a little and see the watery part of
        the world.</span>
    </p>
  </body>
</html>`,
    )
  })

  void it("can tag sentences in nested textblocks", () => {
    const input = xmlParser.parse(/* xml */ `
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
    `) as ParsedXml

    const output = tagSentences(input)

    assert.strictEqual(
      xmlBuilder.build(output),
      /* xml */ `
<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" epub:prefix="z3998: http://www.daisy.org/z3998/2012/vocab/structure/#" lang="en" xml:lang="en">
    
  <head>
    <link href="../styles/9781534431010.css" rel="stylesheet" type="text/css"/>
    <link href="../styles/SS_global.css" rel="stylesheet" type="text/css"/>
    <link rel="stylesheet" href="../../Styles/storyteller-readaloud.css" type="text/css"/>
  </head>
    
  <body>
    <blockquote class="blockquotelet">
      <p class="blockno"><span aria-label="page 7" id="page_7" role="doc-pagebreak"/></p>
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

  void it("can tag sentences that cross textblock boundaries", () => {
    const input = xmlParser.parse(/* xml */ `
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
    `) as ParsedXml

    const output = tagSentences(input)

    assert.strictEqual(
      xmlBuilder.build(output),
      /* xml */ `
<?xml version="1.0" encoding="UTF-8"?><html>
  <head>
    <meta charset="utf-8"/>
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

  void it("can handle soft page breaks", () => {
    const input = xmlParser.parse(/* xml */ `
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en-US" xml:lang="en-US">
  <head>
    <title>Chapter 1, Black Powder War</title>
    <meta charset="utf-8"/>
    <link href="../css/prh_resets.css" rel="stylesheet" type="text/css"/>
    <link href="../css/rh_static.css" rel="stylesheet" type="text/css"/>
    <link href="../css/9780345493439_style.css" rel="stylesheet" type="text/css"/>
<meta content="urn:uuid:52698e83-e600-48be-b763-c64bde1e3e0c" name="Adept.expected.resource"/>
  </head>
  <body>
    <a id="d1-d2s6d3s2"/>
    <div class="page_top_padding">
      <span epub:type="pagebreak" id="page_9" role="doc-pagebreak" title="9"/>
      <h1 class="para-cn-chap-pg trajan-pro-3">CHAPTER 1</h1>
      <div class="para-orn">
        <span class="figure figure_dingbat">
        <img alt="" class="height_1em" role="presentation" src="../images/Novi_9780345493439_epub3_001_r1.jpg"/></span></div>
      <p class="para-pf dropcaps3line char-dropcap-DC trajan-pro-3-dc" style="text-indent:0;">The hot wind blowing into Macao was sluggish and unrefreshing, only stirring up the rotting salt smell of the harbor, the fish-corpses and great knots of black-red seaweed, the effluvia of human and dragon wastes. Even so the sailors were sitting crowded along the rails of the <i class="char-i">Allegiance</i> for a breath of the moving air, leaning against one another to get a little room. A little scuffling broke out amongst them from time to time, a dull exchange of shoving back and forth, but these quarrels died almost at once in the punishing heat.</p>
      <p class="para-p">Temeraire lay disconsolately upon the dragondeck, gazing towards the white haze of the open ocean, the aviators on duty lying half-asleep in his great shadow. Laurence himself had sacrificed dignity so far as to take off his coat, as he was sitting in the crook of Temeraire’s foreleg and so concealed from view.</p>
      <p class="para-p">“I am sure I could pull the ship out of the harbor,” Temeraire said, not for the first time in the past week; and sighed when this amiable plan was again refused: in a calm he might indeed have been able to tow even the enormous dragon transport, but against a direct headwind he could only exhaust himself to no purpose.</p>
      <span epub:type="pagebreak" id="page_10" role="doc-pagebreak" title="10"/>
      <p class="para-p">“Even in a calm you could scarcely pull her any great distance,” Laurence added consolingly. “A few miles may be of some use out in the open ocean, but at present we may as well stay in harbor, and be a little more comfortable; we would make very little speed even if we could get her out.”</p>
      <p class="para-p">“It seems a great pity to me that we must always be waiting on the wind, when everything else is ready and we are also,” Temeraire said. “I would so like to be home <i class="char-i">soon:</i> there is so very much to be done.” His tail thumped hollowly upon the boards, for emphasis.</p>
      <p class="para-p">“I beg you will not raise your hopes too high,” Laurence said, himself a little hopelessly: urging Temeraire to restraint had so far not produced any effect, and he did not expect a different event now. “You must be prepared to endure some delays; at home as much as here.”</p>
    </div>
  </body>
</html>`) as ParsedXml

    const output = tagSentences(input)

    assert.strictEqual(
      xmlBuilder.build(output),
      /* xml */ `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en-US" xml:lang="en-US">
  <head>
    <title>Chapter 1, Black Powder War</title>
    <meta charset="utf-8"/>
    <link href="../css/prh_resets.css" rel="stylesheet" type="text/css"/>
    <link href="../css/rh_static.css" rel="stylesheet" type="text/css"/>
    <link href="../css/9780345493439_style.css" rel="stylesheet" type="text/css"/>
<meta content="urn:uuid:52698e83-e600-48be-b763-c64bde1e3e0c" name="Adept.expected.resource"/>
  </head>
  <body>
    <a id="d1-d2s6d3s2"/>
    <div class="page_top_padding">
      <span epub:type="pagebreak" id="page_9" role="doc-pagebreak" title="9"/>
      <h1 class="para-cn-chap-pg trajan-pro-3"><span id="sentence0">CHAPTER 1</span></h1>
      <div class="para-orn">
        <span class="figure figure_dingbat">
        </span><span class="figure figure_dingbat"><img alt="" class="height_1em" role="presentation" src="../images/Novi_9780345493439_epub3_001_r1.jpg"/></span></div>
      <p class="para-pf dropcaps3line char-dropcap-DC trajan-pro-3-dc" style="text-indent:0;">The hot wind blowing into Macao was sluggish and unrefreshing, only stirring up the rotting salt smell of the harbor, the fish-corpses and great knots of black-red seaweed, the effluvia of human and dragon wastes. <span id="sentence1">Even so the sailors were sitting crowded along the rails of the <i class="char-i">Allegiance</i> for a breath of the moving air, leaning against one another to get a little room.</span> <span id="sentence2">A little scuffling broke out amongst them from time to time, a dull exchange of shoving back and forth, but these quarrels died almost at once in the punishing heat.</span></p>
      <p class="para-p"><span id="sentence3">Temeraire lay disconsolately upon the dragondeck, gazing towards the white haze of the open ocean, the aviators on duty lying half-asleep in his great shadow.</span> <span id="sentence4">Laurence himself had sacrificed dignity so far as to take off his coat, as he was sitting in the crook of Temeraire’s foreleg and so concealed from view.</span></p>
      <p class="para-p"><span id="sentence5">“I am sure I could pull the ship out of the harbor,” Temeraire said, not for the first time in the past week; and sighed when this amiable plan was again refused: in a calm he might indeed have been able to tow even the enormous dragon transport, but against a direct headwind he could only exhaust himself to no purpose.</span></p>
      <span epub:type="pagebreak" id="page_10" role="doc-pagebreak" title="10"/>
      <p class="para-p"><span id="sentence6">“Even in a calm you could scarcely pull her any great distance,” Laurence added consolingly.</span> <span id="sentence7">“A few miles may be of some use out in the open ocean, but at present we may as well stay in harbor, and be a little more comfortable; we would make very little speed even if we could get her out.”</span></p>
      <p class="para-p"><span id="sentence8">“It seems a great pity to me that we must always be waiting on the wind, when everything else is ready and we are also,” Temeraire said.</span> <span id="sentence9">“I would so like to be home <i class="char-i">soon:</i> there is so very much to be done.”</span> <span id="sentence10">His tail thumped hollowly upon the boards, for emphasis.</span></p>
      <p class="para-p"><span id="sentence11">“I beg you will not raise your hopes too high,” Laurence said, himself a little hopelessly: urging Temeraire to restraint had so far not produced any effect, and he did not expect a different event now.</span> <span id="sentence12">“You must be prepared to endure some delays; at home as much as here.”</span></p>
    </div>
  </body>
</html>`,
    )
  })
})
