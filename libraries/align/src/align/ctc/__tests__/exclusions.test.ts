import assert from "node:assert"
import { before, describe, it } from "node:test"

import { ZipFile } from "yazl"

import {
  Epub,
  type EpubReader,
  MemoryAdapter,
} from "@storyteller-platform/epub"

import {
  type ExclusionTier,
  type ExclusionVerdict,
  type SpineClassification,
  classifySpine,
} from "../exclusions.ts"

type Zone = "front" | "body" | "back"

interface Expectation {
  verdict: ExclusionVerdict
  tier: ExclusionTier | null
  value?: string
}

interface SpineFixture {
  id: string
  href: string
  contents: string | Uint8Array
  because: string
  expect: Expectation
  mediaType?: string
  properties?: string
  linear?: "no"
  landmark?: string
  guide?: string
}

function page(body: string, bodyType?: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Page</title></head>
<body${bodyType ? ` epub:type="${bodyType}"` : ""}>${body}</body>
</html>`
}

function section(type: string, inner: string) {
  return `<section epub:type="${type}">${inner}</section>`
}

function prose(heading: string) {
  return `<h1>${heading}</h1><p>The rain had not stopped for three days, and nobody in the village remembered what the river looked like when it was calm.</p><p>She folded the letter twice and put it back in her coat.</p>`
}

function image(src: string) {
  return `<div><img src="${src}" alt=""/></div>`
}

function by(
  verdict: ExclusionVerdict,
  tier: ExclusionTier,
  value?: string,
): Expectation {
  return value === undefined ? { verdict, tier } : { verdict, tier, value }
}

const byDefault: Expectation = { verdict: "include", tier: null }

const front: SpineFixture[] = [
  {
    id: "cover",
    href: "Text/cover.xhtml",
    contents: page(image("../Images/cover.jpg")),
    landmark: "cover",
    guide: "cover",
    because: "a cover landmark decides before the guide or the empty text do",
    expect: by("exclude", "landmark", "cover"),
  },
  {
    id: "nav",
    href: "nav/nav.xhtml",
    properties: "nav",
    contents: "",
    because: "the navigation document is never narrated",
    expect: by("exclude", "nav"),
  },
  {
    id: "halftitle",
    href: "Text/halftitle.xhtml",
    contents: page("<h1>The Drowned Village</h1>", "frontmatter halftitlepage"),
    because: "a specific epub:type beats the division type next to it",
    expect: by("exclude", "content-type", "halftitlepage"),
  },
  {
    id: "titlepage",
    href: "Text/titlepage.xhtml",
    contents: page(
      "<h1>The Drowned Village</h1><p>A novel by Someone Who Writes Novels</p>",
      "bodymatter",
    ),
    landmark: "titlepage",
    because:
      "a titlepage landmark beats the blanket bodymatter tag some converters stamp on every page",
    expect: by("exclude", "landmark", "titlepage"),
  },
  {
    id: "crt_copyright",
    href: "Text/crt_copyright.xhtml",
    contents: page(
      "<p>Copyright 2026 by the author. All rights reserved. No part of this book may be reproduced.</p>",
    ),
    because: "an untagged copyright filename in the front zone is trusted",
    expect: by("exclude", "filename", "copyright"),
  },
  {
    id: "legal",
    href: "Text/legal.xhtml",
    contents: page(
      "<p>Published by a publisher of books in a city with many publishers.</p>",
    ),
    guide: "copyright-page",
    because:
      "the legacy guide is the only signal on a page with a meaningless filename",
    expect: by("exclude", "guide", "copyright-page"),
  },
  {
    id: "contents",
    href: "Text/contents.xhtml",
    contents: page(
      section(
        "toc",
        '<h1>Contents</h1><ol><li><a href="gaba_epub_c_r1.xhtml">One</a></li></ol>',
      ),
    ),
    linear: "no",
    landmark: "toc",
    because: "linear no is checked before anything else",
    expect: by("exclude", "linear", "no"),
  },
  {
    id: "dedication",
    href: "Text/dedication.xhtml",
    contents: page("<p>For my mother, who never learned to swim.</p>"),
    landmark: "dedication",
    because:
      "a dedication landmark excludes just like the dedication content type does",
    expect: by("exclude", "landmark", "dedication"),
  },
  {
    id: "epigraph",
    href: "Text/epigraph.xhtml",
    contents: page(
      section(
        "epigraph",
        "<blockquote><p>Water always finds its way home.</p></blockquote>",
      ),
    ),
    because: "an epigraph section on an untagged body is enough",
    expect: by("exclude", "content-type", "epigraph"),
  },
  {
    id: "praise",
    href: "Text/PraiseFor.xhtml",
    contents: page(
      "<p>A triumph of damp atmosphere, says a newspaper that reviews books.</p>",
    ),
    because: "camelCase filenames still split into tokens",
    expect: by("exclude", "filename", "praise"),
  },
  {
    id: "map",
    href: "Text/map_westeros.xhtml",
    contents: page(
      `${image("../Images/map.jpg")}<p>The Seven Kingdoms and the lands beyond the wall</p>`,
    ),
    because: "a captioned map in the front zone is caught by its filename",
    expect: by("exclude", "filename", "map"),
  },
  {
    id: "mapmaker",
    href: "Text/chapter-01-mapmaker.xhtml",
    contents: page(prose("The Mapmaker")),
    because: "map inside a longer word is not the map token",
    expect: byDefault,
  },
  {
    id: "foreword",
    href: "Text/foreword.xhtml",
    contents: page(prose("Foreword"), "foreword"),
    because: "a foreword may or may not be narrated",
    expect: by("review", "content-type", "foreword"),
  },
  {
    id: "preface",
    href: "Text/preface.xhtml",
    contents: page(prose("Preface")),
    because: "an untagged preface in the front zone is flagged by filename",
    expect: by("review", "filename", "preface"),
  },
  {
    id: "introduction",
    href: "Text/introduction.xhtml",
    contents: page(prose("Introduction")),
    landmark: "introduction",
    because: "an introduction landmark flags for review, it does not exclude",
    expect: by("review", "landmark", "introduction"),
  },
  {
    id: "prologue",
    href: "Text/prologue.xhtml",
    contents: page(prose("Prologue"), "prologue"),
    landmark: "bodymatter",
    because: "a bodymatter landmark with a fragment still resolves to its file",
    expect: by("include", "landmark", "bodymatter"),
  },
]

const bodySpecials: SpineFixture[] = [
  {
    id: "footnote_07",
    href: "Text/footnote_07.xhtml",
    contents: page("<p>1. See the parish records for 1842.</p>", "footnote"),
    because: "scattered footnote files key off their tag, not their position",
    expect: by("exclude", "content-type", "footnote"),
  },
  {
    id: "footnote_08",
    href: "Text/footnote_08.xhtml",
    contents: page("<p>2. The river was renamed twice after the flood.</p>"),
    because:
      "an untagged footnote filename mid-spine has no corroborating position",
    expect: byDefault,
  },
  {
    id: "inline_aside",
    href: "Text/inline_aside.xhtml",
    contents: page(
      section(
        "chapter",
        `${prose("The Bell")}<aside epub:type="footnote"><p>3. The bell was cast in 1790.</p></aside>`,
      ),
    ),
    because: "a footnote aside inside a chapter does not make it a footnote",
    expect: by("include", "content-type", "chapter"),
  },
  {
    id: "pagebreaks",
    href: "Text/pagebreaks.xhtml",
    contents: page(
      `${prose("The Ferry")}<span epub:type="pagebreak" id="p42" title="42"/><p>And then the ferry came back empty.</p>`,
    ),
    because: "pagebreak spans are noise, not a content type",
    expect: byDefault,
  },
  {
    id: "newsletter_mid",
    href: "Text/newsletter.xhtml",
    contents: page(prose("Newsletter")),
    because: "a junk filename without a front or back position is not trusted",
    expect: byDefault,
  },
  {
    id: "photo_insert",
    href: "Text/photo_insert_1.xhtml",
    contents: page(image("../Images/plate.jpg")),
    because: "a page with no text at all has nothing to align",
    expect: by("exclude", "no-text"),
  },
  {
    id: "plate",
    href: "Images/plate.jpg",
    mediaType: "image/jpeg",
    contents: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    because: "an image referenced straight from the spine is not a document",
    expect: by("exclude", "media-type", "image/jpeg"),
  },
  {
    id: "map_popup",
    href: "Text/map-popup.xhtml",
    contents: page(section("chapter", prose("The Map of the Valley"))),
    linear: "no",
    because: "linear no beats an include tag",
    expect: by("exclude", "linear", "no"),
  },
  {
    id: "part_two",
    href: "Text/part-two.xhtml",
    contents: page(
      "<h1>Part Two</h1><p>After the water came the long dry years.</p>",
      "part",
    ),
    because: "a part divider is the book",
    expect: by("include", "content-type", "part"),
  },
  {
    id: "interlude",
    href: "Text/Interlude%20One.xhtml",
    contents: page(prose("Interlude One")),
    because: "percent-encoded hrefs with spaces are read like any other",
    expect: byDefault,
  },
]

const back: SpineFixture[] = [
  {
    id: "index_split",
    href: "Text/index_split_130.xhtml",
    contents: page(prose("Chapter Forty")),
    because:
      "the calibre index_split template is a chapter, even in the back zone",
    expect: byDefault,
  },
  {
    id: "last_chapter",
    href: "Text/hobb_epub_c_r41.xhtml",
    contents: page(prose("Chapter Forty-One")),
    because: "the last real chapters sit in the back zone and carry no token",
    expect: byDefault,
  },
  {
    id: "the_newsletter",
    href: "Text/the_newsletter.xhtml",
    contents: page(section("chapter", prose("The Newsletter"))),
    because: "a chapter tag beats a junk filename in the back zone",
    expect: by("include", "content-type", "chapter"),
  },
  {
    id: "epilogue",
    href: "Text/epilogue.xhtml",
    contents: page(prose("Epilogue")),
    because: "epilogue is not an exclusion token",
    expect: byDefault,
  },
  {
    id: "acknowledgments",
    href: "Text/acknowledgments.xhtml",
    contents: page(prose("Acknowledgments"), "backmatter acknowledgments"),
    because:
      "acknowledgments flag for review even next to an excluding division type",
    expect: by("review", "content-type", "acknowledgments"),
  },
  {
    id: "ack",
    href: "Text/ack.xhtml",
    contents: page(prose("Thanks")),
    because: "the short ack filename in the back zone flags for review",
    expect: by("review", "filename", "ack"),
  },
  {
    id: "appendix",
    href: "Text/appendix-a.xhtml",
    contents: page(prose("Appendix A")),
    because: "an untagged appendix in the back zone flags for review",
    expect: by("review", "filename", "appendix"),
  },
  {
    id: "endnotes",
    href: "Text/notes.xhtml",
    contents: page(
      section("endnotes", "<ol><li><p>A note about a river.</p></li></ol>"),
    ),
    because: "collected endnotes are excluded by their section type",
    expect: by("exclude", "content-type", "endnotes"),
  },
  {
    id: "rearnotes",
    href: "Text/rear.xhtml",
    contents: page(
      "<ol><li><p>A note about a bell.</p></li></ol>",
      "rearnotes",
    ),
    because: "the deprecated rearnotes type still excludes",
    expect: by("exclude", "content-type", "rearnotes"),
  },
  {
    id: "glossary",
    href: "Text/glossary.xhtml",
    contents: page("<dl><dt>Weir</dt><dd>A low dam across a river.</dd></dl>"),
    landmark: "glossary",
    because: "a glossary landmark excludes",
    expect: by("exclude", "landmark", "glossary"),
  },
  {
    id: "bibliography",
    href: "Text/sources.xhtml",
    contents: page(
      "<p>Smith, J. Rivers of England. London, 1901.</p>",
      "bibliography",
    ),
    because: "a bibliography body type excludes",
    expect: by("exclude", "content-type", "bibliography"),
  },
  {
    id: "index",
    href: "Text/index.xhtml",
    contents: page("<p>Bell, 12, 88. Ferry, 40–44. River, passim.</p>"),
    because: "a real index filename in the back zone is trusted",
    expect: by("exclude", "filename", "index"),
  },
  {
    id: "copyright_again",
    href: "Text/copyright-2.xhtml",
    contents: page("<p>Copyright 2026 by the author. All rights reserved.</p>"),
    because: "converters duplicate the copyright page at the back",
    expect: by("exclude", "filename", "copyright"),
  },
  {
    id: "about_author",
    href: "Text/About%20the%20Author.xhtml",
    contents: page("<p>The author lives near a river and owns a boat.</p>"),
    because: "a spaced, percent-encoded about-the-author page is caught",
    expect: by("exclude", "filename"),
  },
  {
    id: "about_publisher",
    href: "Text/about_the_publisher.xhtml",
    contents: page("<p>We have published books since before books.</p>"),
    because: "a publisher bio in the back zone is caught",
    expect: by("exclude", "filename"),
  },
  {
    id: "next_reads",
    href: "Text/next-reads.xhtml",
    contents: page("<p>If you liked this, try these other wet books.</p>"),
    because: "imprint next-reads pages carry no tag",
    expect: by("exclude", "filename"),
  },
  {
    id: "torad",
    href: "Text/torad.xhtml",
    contents: page(
      "<p>Sign up for the Tor newsletter to hear about new books.</p>",
    ),
    because: "the Tor ad template is caught",
    expect: by("exclude", "filename", "torad"),
  },
  {
    id: "signup",
    href: "Text/ss_us_adult_signup_1.xhtml",
    contents: page("<p>Get a free ebook when you join our mailing list.</p>"),
    because: "the Simon and Schuster signup template is caught",
    expect: by("exclude", "filename", "signup"),
  },
  {
    id: "discover",
    href: "Text/discover-page.xhtml",
    contents: page("<p>Discover your next great read at our website.</p>"),
    because: "the Penguin Random House discover page is caught",
    expect: by("exclude", "filename"),
  },
  {
    id: "backad",
    href: "Text/backad.xhtml",
    contents: page("<p>Also by this author, many more books about water.</p>"),
    because: "a back ad page is caught",
    expect: by("exclude", "filename", "backad"),
  },
  {
    id: "contributors",
    href: "Text/contributors.xhtml",
    contents: page(
      "<p>The narrator has recorded over two hundred audiobooks.</p>",
    ),
    landmark: "contributors",
    because: "a contributors landmark excludes",
    expect: by("exclude", "landmark", "contributors"),
  },
  {
    id: "seriespage",
    href: "Text/series.xhtml",
    contents: page(
      "<p>The Drowned Village is book one of the Flood trilogy.</p>",
      "seriespage",
    ),
    because: "a seriespage body type excludes",
    expect: by("exclude", "content-type", "seriespage"),
  },
]

function filler(from: number, count: number): SpineFixture[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${from + i}`,
    href: `Text/gaba_epub_c_r${from + i}.xhtml`,
    contents: page(prose(`Chapter ${from + i}`)),
    because: "an untagged imprint-coded chapter is the book",
    expect: byDefault,
  }))
}

const body: SpineFixture[] = [
  ...filler(1, 20),
  ...bodySpecials.flatMap((special, i) => [special, ...filler(21 + i * 5, 5)]),
  ...filler(21 + bodySpecials.length * 5, 26),
]

const spine = [...front, ...body, ...back]

const zones = new Map<string, Zone>([
  ...front.map((item) => [item.id, "front"] as const),
  ...bodySpecials.map((item) => [item.id, "body"] as const),
  ...back.map((item) => [item.id, "back"] as const),
])

const opfDir = "OEBPS"
const navDir = "nav"

function landmarkHref(item: SpineFixture) {
  const href = `../${item.href}`
  return item.id === "prologue" ? `${href}#start` : href
}

function navDocument() {
  const landmarks = spine
    .filter((item) => item.landmark)
    .map(
      (item) =>
        `<li><a epub:type="${item.landmark}" href="${landmarkHref(item)}">${item.id}</a></li>`,
    )
    .join("\n")

  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
<nav epub:type="toc"><h1>Contents</h1><ol>
<li><a href="../Text/prologue.xhtml">Prologue</a></li>
<li><a href="../Text/gaba_epub_c_r1.xhtml">Chapter 1</a></li>
</ol></nav>
<nav epub:type="landmarks" hidden=""><h2>Landmarks</h2><ol>
${landmarks}
</ol></nav>
</body>
</html>`
}

function packageDocument() {
  const manifest = spine
    .map((item) => {
      const properties = item.properties
        ? ` properties="${item.properties}"`
        : ""
      const mediaType = item.mediaType ?? "application/xhtml+xml"
      return `<item id="${item.id}" href="${item.href}" media-type="${mediaType}"${properties}/>`
    })
    .join("\n")

  const itemrefs = spine
    .map(
      (item) =>
        `<itemref idref="${item.id}"${item.linear ? ` linear="${item.linear}"` : ""}/>`,
    )
    .join("\n")

  const guide = spine
    .filter((item) => item.guide)
    .map(
      (item) =>
        `<reference type="${item.guide}" title="${item.id}" href="${item.href}"/>`,
    )
    .join("\n")

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:exclusions-fixture</dc:identifier>
<dc:title>The Drowned Village</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">2026-09-13T00:00:00Z</meta>
</metadata>
<manifest>
${manifest}
<item id="cover-image" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
<item id="map-image" href="Images/map.jpg" media-type="image/jpeg"/>
</manifest>
<spine>
${itemrefs}
</spine>
<guide>
${guide}
<reference type="text" title="Start" href="Text/gaba_epub_c_r1.xhtml"/>
</guide>
</package>`
}

async function buildEpub(): Promise<Buffer> {
  const zip = new ZipFile()
  const add = (name: string, contents: string | Uint8Array) => {
    zip.addBuffer(Buffer.from(contents), name)
  }

  zip.addBuffer(Buffer.from("application/epub+zip"), "mimetype", {
    compress: false,
  })
  add(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="${opfDir}/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  )
  add(`${opfDir}/content.opf`, packageDocument())
  add(`${opfDir}/${navDir}/nav.xhtml`, navDocument())
  add(`${opfDir}/Images/cover.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
  add(`${opfDir}/Images/map.jpg`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))

  for (const item of spine) {
    if (item.properties === "nav") continue
    add(`${opfDir}/${decodeURIComponent(item.href)}`, item.contents)
  }

  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

void describe("classifySpine", () => {
  let epub: EpubReader
  let results: SpineClassification[]

  function resultFor(id: string) {
    const result = results.find((entry) => entry.id === id)
    assert.ok(result, `no classification for ${id}`)
    return result
  }

  before(async () => {
    epub = await Epub.using(MemoryAdapter).from(await buildEpub())
    results = await classifySpine(epub)
  })

  void it("returns one classification per itemref, in spine order", () => {
    assert.deepStrictEqual(
      results.map(({ index, id }) => ({ index, id })),
      spine.map(({ id }, index) => ({ index, id })),
    )
  })

  void it("places every fixture in the zone it was built for", () => {
    for (const [id, zone] of zones) {
      assert.strictEqual(resultFor(id).position, zone, id)
    }
  })

  void it("only decides by a signal it actually collected", () => {
    for (const result of results) {
      if (result.decidedBy === null) continue
      assert.ok(
        result.signals.some(
          (signal) =>
            signal.tier === result.decidedBy?.tier &&
            signal.value === result.decidedBy.value,
        ),
        result.id,
      )
    }
  })

  void it("agrees with the decided signal's verdict", () => {
    for (const result of results) {
      assert.strictEqual(
        result.verdict,
        result.decidedBy?.verdict ?? "include",
        result.id,
      )
    }
  })

  void describe("per spine item", () => {
    for (const item of spine) {
      void it(`${item.id}: ${item.because}`, () => {
        const result = resultFor(item.id)
        assert.strictEqual(result.verdict, item.expect.verdict)
        assert.strictEqual(result.decidedBy?.tier ?? null, item.expect.tier)
        if (item.expect.value !== undefined) {
          assert.strictEqual(result.decidedBy?.value, item.expect.value)
        }
      })
    }
  })

  void describe("precedence keeps the losing evidence", () => {
    const loses = (id: string, tier: ExclusionTier, value: string) => {
      assert.ok(
        resultFor(id).signals.some(
          (signal) => signal.tier === tier && signal.value === value,
        ),
        `${id} should still record ${tier}=${value}`,
      )
    }

    void it("contents records its toc landmark under linear no", () => {
      loses("contents", "landmark", "toc")
    })

    void it("titlepage records the bodymatter content type it overrode", () => {
      loses("titlepage", "content-type", "bodymatter")
    })

    void it("cover records the guide entry and the missing text", () => {
      loses("cover", "guide", "cover")
      loses("cover", "no-text", "")
    })

    void it("the newsletter chapter records the filename it overrode", () => {
      loses("the_newsletter", "filename", "newsletter")
    })

    void it("the map popup records the chapter tag it overrode", () => {
      loses("map_popup", "content-type", "chapter")
    })

    void it("prologue records its own content type under the landmark", () => {
      loses("prologue", "content-type", "prologue")
    })
  })
})
