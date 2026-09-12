import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"

import { Feed as OpdsTsFeed } from "opds-ts/v1.2"

import { toAtomXml } from "@storyteller-platform/opds"
import { parseFeed } from "@storyteller-platform/opds/validate"

import { type TestDbContext, setupTestDb } from "@/__tests__/harness/testDb"
import { getCollections } from "@/database/collections"
import { getSeriesByUuid } from "@/database/series"
import { getTags } from "@/database/tags"
import {
  buildAllBooks,
  buildCollectionBooks,
  buildCollectionsNav,
  buildRootCatalog,
  buildSearchResults,
  buildSeriesBooks,
  buildSeriesNav,
  buildTagBooks,
  buildTagsNav,
} from "@/opds/builders"
import {
  createAllBooksAcquisitionFeed,
  createCollectionAcquisitionFeed,
  createCollectionNavFeed,
  createRootCatalog,
  createSeriesAcquisitionFeed,
  createSeriesNavFeed,
  createTagAcquisitionFeed,
  createTagsNavFeed,
} from "@/opds/feed"

// ---------------------------------------------------------------------------
// seeding: a small library exercising authors, series, tags, collections, and
// every book format. both pipelines read it through the same DB queries.
// ---------------------------------------------------------------------------

interface SeededBook {
  uuid?: string
  title: string
  ebook?: boolean
  audiobook?: boolean
  readaloud?: boolean
}

function seedLibrary(ctx: TestDbContext) {
  const sqlite = ctx.sqlite

  const insertBook = sqlite.prepare(
    `INSERT INTO book (uuid, title, description, language, publication_date, asset_dir)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const insertEbook = sqlite.prepare(
    `INSERT INTO ebook (book_uuid, filepath, page_count) VALUES (?, ?, ?)`,
  )
  const insertAudiobook = sqlite.prepare(
    `INSERT INTO audiobook (book_uuid, filepath) VALUES (?, ?)`,
  )
  const insertReadaloud = sqlite.prepare(
    `INSERT INTO readaloud (book_uuid, filepath, status, current_stage)
     VALUES (?, ?, 'ALIGNED', 'SPLIT_TRACKS')`,
  )
  const insertCreator = sqlite.prepare(
    `INSERT INTO creator (uuid, name, file_as) VALUES (?, ?, ?)`,
  )
  const insertBookCreator = sqlite.prepare(
    `INSERT INTO book_to_creator (book_uuid, creator_uuid, role) VALUES (?, ?, ?)`,
  )
  const insertSeries = sqlite.prepare(
    `INSERT INTO series (uuid, name) VALUES (?, ?)`,
  )
  const insertBookSeries = sqlite.prepare(
    `INSERT INTO book_to_series (series_uuid, book_uuid, position) VALUES (?, ?, ?)`,
  )
  const insertTag = sqlite.prepare(`INSERT INTO tag (uuid, name) VALUES (?, ?)`)
  const insertBookTag = sqlite.prepare(
    `INSERT INTO book_to_tag (tag_uuid, book_uuid) VALUES (?, ?)`,
  )
  const insertCollection = sqlite.prepare(
    `INSERT INTO collection (uuid, name, description, public) VALUES (?, ?, ?, 1)`,
  )
  const insertBookCollection = sqlite.prepare(
    `INSERT INTO book_to_collection (collection_uuid, book_uuid) VALUES (?, ?)`,
  )

  const books: SeededBook[] = [
    { title: "Alpha", ebook: true, readaloud: true },
    { title: "Beta", ebook: true },
    { title: "Gamma", audiobook: true },
    { title: "Delta", ebook: true, audiobook: true },
  ]

  const authorUuid = randomUUID()
  insertCreator.run(authorUuid, "Ada Author", "Author, Ada")

  const seriesUuid = randomUUID()
  insertSeries.run(seriesUuid, "The Series")
  const tagUuid = randomUUID()
  insertTag.run(tagUuid, "Adventure")
  const collectionUuid = randomUUID()
  insertCollection.run(collectionUuid, "Staff Picks", "Our favourites")

  ctx.sqlite.transaction(() => {
    books.forEach((book, i) => {
      const uuid = randomUUID()
      book.uuid = uuid
      insertBook.run(
        uuid,
        book.title,
        `Description for ${book.title}`,
        "en",
        "2020-01-0" + String(i + 1),
        `assets/${book.title}`,
      )
      if (book.ebook) insertEbook.run(uuid, `/lib/${book.title}.epub`, 100 + i)
      if (book.audiobook) insertAudiobook.run(uuid, `/lib/${book.title}.zip`)
      if (book.readaloud)
        insertReadaloud.run(uuid, `/lib/${book.title}.ra.epub`)

      insertBookCreator.run(uuid, authorUuid, "aut")
      insertBookSeries.run(seriesUuid, uuid, i + 1)
      insertBookTag.run(tagUuid, uuid)
      insertBookCollection.run(collectionUuid, uuid)
    })
  })()

  return { seriesUuid, tagUuid, collectionUuid }
}

// ---------------------------------------------------------------------------
// normalize both Atom outputs to the client-relevant data, ignoring cosmetic
// differences (prefixes, ordering, the /v1 path segment, extra metadata).
// ---------------------------------------------------------------------------

interface ParsedLink {
  rel: string
  href: string
  type?: string
}

/** drop the version segment so old (/opds/...) and new (/opds/v1/...) align. */
const canonHref = (href: string): string =>
  href.replace(/^\/opds\/v[12]\b/, "/opds")

const uuidOf = (id: string): string | null =>
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(
    id,
  )?.[0] ?? null

interface NormFeed {
  feedLinks: Map<string, Set<string>>
  pubs: Map<string, { title: string; acq: Set<string>; img: Set<string> }>
  navs: Map<string, string>
}

const relsOf = (link: ParsedLink): string[] => link.rel.split(/\s+/)

const normalize = (xml: string): NormFeed => {
  const feed = OpdsTsFeed.fromXml(xml)

  const feedLinks = new Map<string, Set<string>>()
  for (const link of feed.getLinks() as ParsedLink[]) {
    for (const rel of relsOf(link)) {
      const set = feedLinks.get(rel) ?? new Set<string>()
      set.add(canonHref(link.href))
      feedLinks.set(rel, set)
    }
  }

  const pubsMap = new Map<
    string,
    { title: string; acq: Set<string>; img: Set<string> }
  >()
  const navs = new Map<string, string>()

  for (const entry of feed.getEntries()) {
    const links = entry.getLinks() as ParsedLink[]
    const acq = new Set<string>()
    const img = new Set<string>()
    const subsections = new Set<string>()
    for (const link of links) {
      const rels = relsOf(link)
      if (rels.some((r) => r.includes("acquisition")))
        acq.add(canonHref(link.href))
      if (rels.some((r) => r.includes("/image"))) img.add(canonHref(link.href))
      if (rels.includes("subsection")) subsections.add(canonHref(link.href))
    }

    if (acq.size > 0) {
      const uuid = uuidOf(entry.getId())
      if (uuid) pubsMap.set(uuid, { title: entry.getTitle(), acq, img })
    } else {
      // navigation entry: key by its subsection target
      for (const href of subsections) navs.set(href, entry.getTitle())
    }
  }

  return { feedLinks, pubs: pubsMap, navs }
}

/**
 * the default OPDS format ("readaloud") shows the read-aloud epub in place of
 * the plain ebook when a book has both, where the legacy feed offered both.
 * project the old acquisitions through that rule before comparing.
 */
const projectDefaultFormat = (acq: Set<string>): Set<string> => {
  const hasReadaloud = [...acq].some((h) => h.includes("format=readaloud"))
  if (!hasReadaloud) return acq
  return new Set([...acq].filter((h) => !h.includes("format=ebook")))
}

/** asserts every client-relevant datum in `old` survives into `next`. */
const assertPreserved = (label: string, oldXml: string, nextXml: string) => {
  const a = normalize(oldXml)
  const b = normalize(nextXml)

  for (const [rel, hrefs] of a.feedLinks) {
    const got = b.feedLinks.get(rel) ?? new Set<string>()
    for (const href of hrefs) {
      assert.ok(
        got.has(href),
        `${label}: feed link rel="${rel}" href="${href}" missing from new feed`,
      )
    }
  }

  for (const [uuid, pub] of a.pubs) {
    const got = b.pubs.get(uuid)
    assert.ok(got, `${label}: publication ${uuid} missing from new feed`)
    assert.strictEqual(got.title, pub.title, `${label}: title for ${uuid}`)
    for (const href of projectDefaultFormat(pub.acq)) {
      assert.ok(
        got.acq.has(href),
        `${label}: acquisition ${href} missing for ${uuid}`,
      )
    }
    for (const href of pub.img) {
      assert.ok(
        got.img.has(href),
        `${label}: image ${href} missing for ${uuid}`,
      )
    }
  }

  for (const [href, title] of a.navs) {
    assert.ok(
      b.navs.has(href),
      `${label}: navigation target ${href} missing from new feed`,
    )
    assert.strictEqual(
      b.navs.get(href),
      title,
      `${label}: nav title for ${href}`,
    )
  }
}

void describe("OPDS v1 parity (old feed.ts vs new builders)", () => {
  void it("root catalog", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const oldXml = (await createRootCatalog({})).toXml({ prettyPrint: true })
    const newXml = toAtomXml(await buildRootCatalog({ version: "v1" }))
    assertPreserved("root", oldXml, newXml)
  })

  void it("all books", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const oldXml = (await createAllBooksAcquisitionFeed({})).toXml({
      prettyPrint: true,
    })
    const newXml = toAtomXml(await buildAllBooks({ version: "v1" }))
    assertPreserved("books", oldXml, newXml)
  })

  void it("series navigation", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const oldXml = (await createSeriesNavFeed({})).toXml({ prettyPrint: true })
    const newXml = toAtomXml(await buildSeriesNav({ version: "v1" }))
    assertPreserved("series-nav", oldXml, newXml)
  })

  void it("series books", async () => {
    using ctx = setupTestDb()
    const { seriesUuid } = seedLibrary(ctx)

    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
    const series = await getSeriesByUuid(seriesUuid as never)
    assert.ok(series)
    const oldXml = (
      await createSeriesAcquisitionFeed({}, series, {
        sortBy: "updatedAt",
        sortOrder: "desc",
      })
    ).toXml({ prettyPrint: true })
    const newXml = toAtomXml(await buildSeriesBooks({ version: "v1" }, series))
    assertPreserved("series-books", oldXml, newXml)
  })

  void it("tags navigation", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const oldXml = (await createTagsNavFeed({})).toXml({ prettyPrint: true })
    const newXml = toAtomXml(await buildTagsNav({ version: "v1" }))
    assertPreserved("tags-nav", oldXml, newXml)
  })

  void it("tag books", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const [tag] = await getTags()
    assert.ok(tag)
    const oldXml = (await createTagAcquisitionFeed({}, tag)).toXml({
      prettyPrint: true,
    })
    const newXml = toAtomXml(await buildTagBooks({ version: "v1" }, tag))
    assertPreserved("tag-books", oldXml, newXml)
  })

  void it("collections navigation", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const oldXml = (await createCollectionNavFeed({})).toXml({
      prettyPrint: true,
    })
    const newXml = toAtomXml(await buildCollectionsNav({ version: "v1" }))
    assertPreserved("collections-nav", oldXml, newXml)
  })

  void it("collection books", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const [collection] = await getCollections()
    assert.ok(collection)
    const oldXml = (
      await createCollectionAcquisitionFeed({}, collection)
    ).toXml({ prettyPrint: true })
    const newXml = toAtomXml(
      await buildCollectionBooks({ version: "v1" }, collection),
    )
    assertPreserved("collection-books", oldXml, newXml)
  })

  void it("search results", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const newXml = toAtomXml(
      await buildSearchResults({ version: "v1" }, "Alpha"),
    )
    // the new search feed must surface the matching book
    const norm = normalize(newXml)
    assert.strictEqual(norm.pubs.size, 1, "search matched exactly one book")
  })

  void it("v2 JSON validates against the OPDS2 schema", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildAllBooks({ version: "v2" })
    const result = parseFeed(feed.serialize())
    assert.ok(
      result.ok,
      `v2 feed failed validation: ${JSON.stringify(result.ok ? [] : result.errors)}`,
    )
  })
})

/** maps each entry title to the set of `?format=` tokens it exposes. */
const formatsByTitle = (xml: string): Map<string, Set<string>> => {
  const out = new Map<string, Set<string>>()
  for (const { title, acq } of normalize(xml).pubs.values()) {
    const fmts = new Set<string>()
    for (const href of acq) {
      const m = /format=([a-z-]+)/.exec(href)
      if (m?.[1]) fmts.add(m[1])
    }
    out.set(title, fmts)
  }
  return out
}

void describe("OPDS format setting", () => {
  void it("readaloud (default): prefers read-aloud, audiobook always served", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const xml = toAtomXml(
      await buildAllBooks({ version: "v1", format: "readaloud" }),
    )
    const f = formatsByTitle(xml)
    // Alpha has read-aloud + ebook -> read-aloud wins.
    assert.deepStrictEqual([...(f.get("Alpha") ?? [])], ["readaloud"])
    assert.deepStrictEqual([...(f.get("Beta") ?? [])], ["ebook"])
    assert.deepStrictEqual([...(f.get("Gamma") ?? [])], ["audiobook-rpf"])
    assert.deepStrictEqual([...(f.get("Delta") ?? [])].sort(), [
      "audiobook-rpf",
      "ebook",
    ])
  })

  void it("ebook: prefers the plain ebook, audiobook always served", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const xml = toAtomXml(
      await buildAllBooks({ version: "v1", format: "ebook" }),
    )
    const f = formatsByTitle(xml)
    // Alpha has read-aloud + ebook -> ebook wins.
    assert.deepStrictEqual([...(f.get("Alpha") ?? [])], ["ebook"])
    for (const fmts of f.values()) {
      assert.ok(!fmts.has("readaloud"), "no read-aloud links in ebook mode")
    }
    // audiobook is still served.
    assert.deepStrictEqual([...(f.get("Gamma") ?? [])], ["audiobook-rpf"])
  })

  void it("both: serves read-aloud and ebook together", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const xml = toAtomXml(
      await buildAllBooks({ version: "v1", format: "both" }),
    )
    const f = formatsByTitle(xml)
    assert.deepStrictEqual([...(f.get("Alpha") ?? [])].sort(), [
      "ebook",
      "readaloud",
    ])
  })
})
