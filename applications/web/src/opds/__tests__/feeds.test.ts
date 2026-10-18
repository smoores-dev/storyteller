import assert from "node:assert"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { cwd } from "node:process"

import { describe, it } from "vitest"

import { type Feed, toAtomXml } from "@storyteller-platform/opds"
import { parseFeed } from "@storyteller-platform/opds/validate"

import { type TestDbContext, setupTestDb } from "@/__tests__/harness/testDb"
import { NONE_FACET_KEY } from "@/database/libraryCounts"
import {
  type BuildContext,
  type OpdsVersion,
  buildAllBooks,
  buildRootCatalog,
  buildSearchResults,
  buildSectionBooks,
  buildSectionNav,
  createOpenSearchDescription,
  parseVersion,
} from "@/opds/builders"
import { type UUID } from "@/uuid"

const userId = "11111111-1111-1111-1111-111111111111" as UUID
const viewer = { id: userId, permissions: { bookRead: true, bookList: true } }

const ids = {
  ada: "c0000000-0000-0000-0000-000000000001",
  bob: "c0000000-0000-0000-0000-000000000002",
  cy: "c0000000-0000-0000-0000-000000000003",
  series: "d0000000-0000-0000-0000-000000000001",
  tag: "e0000000-0000-0000-0000-000000000001",
  collection: "f0000000-0000-0000-0000-000000000001",
}

interface SeededBook {
  title: string
  author: string
  ebook?: boolean
  audiobook?: boolean
  readaloud?: boolean
  seriesPosition?: number
  rating?: number
  tagged?: boolean
  collected?: boolean
}

const BOOKS: SeededBook[] = [
  {
    title: "Zebra Tales",
    author: ids.ada,
    ebook: true,
    seriesPosition: 2,
    rating: 5,
    collected: true,
  },
  {
    title: "apple orchard",
    author: ids.bob,
    ebook: true,
    readaloud: true,
    seriesPosition: 1,
    rating: 3,
  },
  { title: "Mango", author: ids.ada, audiobook: true, collected: true },
  {
    title: "Banana Split",
    author: ids.cy,
    ebook: true,
    audiobook: true,
    rating: 4,
    tagged: true,
  },
]

function seedLibrary(ctx: TestDbContext) {
  const { sqlite } = ctx
  const run = (statement: string, ...values: unknown[]) =>
    sqlite.prepare(statement).run(...values)

  run(
    `INSERT INTO user_permission (uuid, book_list, book_read) VALUES (?, 1, 1)`,
    "22222222-2222-2222-2222-222222222222",
  )
  run(
    `INSERT INTO "user" (id, user_permission_uuid, email) VALUES (?, ?, ?)`,
    userId,
    "22222222-2222-2222-2222-222222222222",
    "reader@example.com",
  )
  run(
    `INSERT INTO creator (uuid, name, file_as) VALUES (?, 'Ada Author', 'Author, Ada'), (?, 'Bob Writer', 'Writer, Bob'), (?, 'Cy Scribe', 'Scribe, Cy')`,
    ids.ada,
    ids.bob,
    ids.cy,
  )
  run(`INSERT INTO series (uuid, name) VALUES (?, 'The Series')`, ids.series)
  run(`INSERT INTO tag (uuid, name) VALUES (?, 'Adventure')`, ids.tag)
  run(
    `INSERT INTO collection (uuid, name, public) VALUES (?, 'Staff Picks', 1)`,
    ids.collection,
  )

  const uuids: Record<string, string> = {}
  sqlite.transaction(() => {
    BOOKS.forEach((book, i) => {
      const row = sqlite
        .prepare(
          `INSERT INTO book (title, language, publication_date, asset_dir) VALUES (?, 'en', ?, ?) RETURNING uuid`,
        )
        .get(book.title, `2020-01-0${i + 1}`, `assets/${book.title}`) as {
        uuid: string
      }
      const uuid = row.uuid
      uuids[book.title] = uuid

      if (book.ebook) {
        run(
          `INSERT INTO ebook (book_uuid, filepath, page_count) VALUES (?, ?, 100)`,
          uuid,
          `/lib/${book.title}.epub`,
        )
      }

      if (book.audiobook) {
        run(
          `INSERT INTO audiobook (book_uuid, filepath) VALUES (?, ?)`,
          uuid,
          `/lib/${book.title}`,
        )
      }

      if (book.readaloud) {
        run(
          `INSERT INTO readaloud (book_uuid, filepath, status, current_stage) VALUES (?, ?, 'ALIGNED', 'SPLIT_TRACKS')`,
          uuid,
          `/lib/${book.title}.ra.epub`,
        )
      }

      run(
        `INSERT INTO book_to_creator (book_uuid, creator_uuid, role) VALUES (?, ?, 'aut')`,
        uuid,
        book.author,
      )
      if (book.seriesPosition !== undefined) {
        run(
          `INSERT INTO book_to_series (series_uuid, book_uuid, position) VALUES (?, ?, ?)`,
          ids.series,
          uuid,
          book.seriesPosition,
        )
      }

      if (book.rating !== undefined) {
        run(
          `INSERT INTO user_book_rating (user_id, book_uuid, rating) VALUES (?, ?, ?)`,
          userId,
          uuid,
          book.rating,
        )
      }

      if (book.tagged) {
        run(
          `INSERT INTO book_to_tag (tag_uuid, book_uuid) VALUES (?, ?)`,
          ids.tag,
          uuid,
        )
      }

      if (book.collected) {
        run(
          `INSERT INTO book_to_collection (collection_uuid, book_uuid) VALUES (?, ?)`,
          ids.collection,
          uuid,
        )
      }
    })
  })()

  return uuids
}

const context = (
  params: Record<string, string> = {},
  overrides: Partial<BuildContext> = {},
): BuildContext => ({
  version: "v1",
  viewer,
  format: "readaloud",
  sort: { field: "title", direction: "asc" },
  pageSize: null,
  page: Number(params["page"] ?? "1"),
  params: new URLSearchParams(params),
  ...overrides,
})

const titles = (feed: Feed | null) =>
  feed?.publications?.map((publication) =>
    publication.metadata.title.getTranslation(),
  ) ?? []

const navTitles = (feed: Feed) =>
  feed.navigation?.items.map((link) => link.title) ?? []

const hrefOf = (feed: Feed, rel: string) =>
  feed.links.items.find((link) => link.rels?.has(rel))?.href

const facetGroup = (feed: Feed, title: string) =>
  feed.facets?.find((facet) => facet.metadata?.title === title)

const activeFacet = (feed: Feed, group: string) =>
  facetGroup(feed, group)?.links.items.find((link) => link.rels?.has("self"))
    ?.title

const acquisitionFormats = (feed: Feed) =>
  new Map(
    feed.publications?.map((publication) => [
      publication.metadata.title.getTranslation(),
      publication.links.items
        .map((link) => /format=([a-z-]+)/.exec(link.href)?.[1])
        .filter(Boolean)
        .sort(),
    ]),
  )

const assertValidV2 = (feed: Feed | null) => {
  assert.ok(feed)
  const result = parseFeed(feed.serialize())
  assert.ok(
    result.ok,
    `v2 feed failed validation: ${JSON.stringify(result.ok ? [] : result.errors)}`,
  )
}

describe("OPDS search", () => {
  it("resolves the OpenSearch template to the search route and finds the book", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const template = /template="([^"]+)"/.exec(
      createOpenSearchDescription(),
    )?.[1]
    assert.ok(template)
    const url = new URL(
      template.replace("{searchTerms}", "orchard"),
      "http://storyteller.test",
    )

    const [, opds, version, route] = url.pathname.split("/")
    assert.strictEqual(opds, "opds")
    assert.strictEqual(parseVersion(version), "v1")
    assert.ok(
      existsSync(
        join(cwd(), "src/app/opds/[version]", route ?? "", "route.ts"),
      ),
      `${url.pathname} does not resolve to a route file`,
    )

    const feed = await buildSearchResults(
      context(Object.fromEntries(url.searchParams)),
      url.searchParams.get("query"),
    )
    assert.deepStrictEqual(titles(feed), ["apple orchard"])
  })

  it("does not serve the root catalog for an unknown version segment", () => {
    assert.strictEqual(parseVersion("search"), null)
    assert.strictEqual(parseVersion(undefined), "v1")
  })

  it("offers a direct search link in v1 feeds for clients without OpenSearch", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const xml = toAtomXml(await buildRootCatalog(context()))
    assert.match(
      xml,
      /<link href="\/opds\/v1\/search\?query=\{searchTerms\}" rel="search" type="application\/atom\+xml;profile=opds-catalog;kind=acquisition"\/>/,
    )
    assert.match(xml, /href="\/opds\/search\.xml" rel="search"/)
  })

  it("expands the v2 search template to the same route", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildRootCatalog(context({}, { version: "v2" }))
    const search = feed.links.items.find((link) => link.rels?.has("search"))
    assert.strictEqual(search?.href, "/opds/v2/search{?query}")
    assert.strictEqual(search.templated, true)
  })

  it("matches authors and series like the library search", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    assert.deepStrictEqual(
      titles(await buildSearchResults(context(), "Ada Author")).sort(),
      ["Mango", "Zebra Tales"],
    )
    assert.deepStrictEqual(
      titles(await buildSearchResults(context(), "the series")).sort(),
      ["Zebra Tales", "apple orchard"],
    )
  })

  it("paginates results and keeps the query in page links", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildSearchResults(
      context({ query: "Ada" }, { pageSize: 1 }),
      "Ada",
    )
    assert.strictEqual(titles(feed).length, 1)
    assert.strictEqual(feed.metadata.numberOfItems, 2)
    assert.strictEqual(hrefOf(feed, "next"), "/opds/v1/search?query=Ada&page=2")
  })
})

describe("OPDS ordering", () => {
  it("lists all books by title, A to Z, by default", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    assert.deepStrictEqual(titles(await buildAllBooks(context())), [
      "apple orchard",
      "Banana Split",
      "Mango",
      "Zebra Tales",
    ])
  })

  it("follows the default sort setting", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildAllBooks(
      context({}, { sort: { field: "publicationDate", direction: "desc" } }),
    )
    assert.deepStrictEqual(titles(feed), [
      "Banana Split",
      "Mango",
      "apple orchard",
      "Zebra Tales",
    ])
  })

  it("orders a series by position whatever the default", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildSectionBooks(
      context({}, { sort: { field: "title", direction: "desc" } }),
      "series",
      ids.series,
    )
    assert.deepStrictEqual(titles(feed), ["apple orchard", "Zebra Tales"])
  })

  it("orders a rating highest first", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildSectionBooks(context(), "ratings", "2.5-3.49")
    assert.deepStrictEqual(titles(feed), ["apple orchard"])

    const nav = await buildSectionNav(context(), "ratings")
    assert.ok(navTitles(nav).includes("★★★★★"))
  })

  it("lets a sort facet override the order and marks it active", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildAllBooks(context({ sort: "userRating" }))
    assert.deepStrictEqual(titles(feed).slice(0, 3), [
      "Zebra Tales",
      "Banana Split",
      "apple orchard",
    ])
    assert.strictEqual(activeFacet(feed, "Sort by"), "My Rating")
    assert.strictEqual(activeFacet(feed, "Order"), "Descending")

    const xml = toAtomXml(feed)
    const active = xml
      .split("\n")
      .filter((line) => line.includes('opds:activeFacet="true"'))
    assert.strictEqual(active.length, 3)
    assert.match(active[0] ?? "", /title="My Rating"/)
    assert.match(active[0] ?? "", /opds:facetGroup="Sort by"/)
    assert.match(active[0] ?? "", /rel="http:\/\/opds-spec\.org\/facet"/)
  })

  it("filters by the format facet", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildAllBooks(context({ format: "audiobook" }))
    assert.deepStrictEqual(titles(feed), ["Banana Split", "Mango"])
    assert.strictEqual(activeFacet(feed, "Format"), "Has audiobook")
  })
})

describe("OPDS facet feeds", () => {
  it("links all books, every library facet and each collection from the root", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const titlesAtRoot = navTitles(await buildRootCatalog(context()))
    assert.deepStrictEqual(titlesAtRoot, [
      "All Books",
      "By Series",
      "By Author",
      "By Narrator",
      "By Translator",
      "By Tag",
      "By Collection",
      "By Status",
      "By Year",
      "By Rating",
      "By Format",
      "By Shelf",
      "Staff Picks",
    ])
  })

  it("lists a facet's values with counts and a bucket for books without one", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const nav = await buildSectionNav(context(), "series")
    assert.deepStrictEqual(navTitles(nav), ["The Series", "(no series)"])
    assert.match(toAtomXml(nav), /thr:count="2"/)

    const none = await buildSectionBooks(context(), "series", NONE_FACET_KEY)
    assert.deepStrictEqual(titles(none), ["Banana Split", "Mango"])
  })

  it("paginates facet values", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const nav = await buildSectionNav(context({}, { pageSize: 2 }), "authors")
    assert.deepStrictEqual(navTitles(nav).length, 2)
    assert.strictEqual(hrefOf(nav, "next"), "/opds/v1/authors?page=2")

    const second = await buildSectionNav(
      context({ page: "2" }, { pageSize: 2 }),
      "authors",
    )
    assert.strictEqual(navTitles(second).length, 1)
  })

  it("pages through a series past the first page", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const feed = await buildSectionBooks(
      context({}, { pageSize: 1 }),
      "series",
      ids.series,
    )
    assert.ok(feed)
    assert.strictEqual(feed.metadata.numberOfItems, 2)
    assert.strictEqual(
      hrefOf(feed, "next"),
      `/opds/v1/series/${ids.series}/books?page=2`,
    )
  })

  it("serves the same books for a tag and a collection as the library", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    assert.deepStrictEqual(
      titles(await buildSectionBooks(context(), "tags", ids.tag)),
      ["Banana Split"],
    )
    assert.deepStrictEqual(
      titles(await buildSectionBooks(context(), "collections", ids.collection)),
      ["Mango", "Zebra Tales"],
    )
    assert.deepStrictEqual(
      titles(await buildSectionBooks(context(), "authors", ids.ada)),
      ["Mango", "Zebra Tales"],
    )
  })

  it("returns nothing for a value the reader cannot see", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    assert.strictEqual(
      await buildSectionBooks(
        context(),
        "tags",
        "e0000000-0000-0000-0000-00000000dead",
      ),
      null,
    )
  })

  it("produces v2 feeds that validate against the OPDS2 schema", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const v2 = context({}, { version: "v2" as OpdsVersion, pageSize: 2 })
    assertValidV2(await buildRootCatalog(v2))
    assertValidV2(await buildAllBooks(v2))
    assertValidV2(await buildSectionNav(v2, "authors"))
    assertValidV2(await buildSectionBooks(v2, "series", ids.series))
    assertValidV2(await buildSearchResults(v2, "Ada"))
  })
})

describe("OPDS format setting", () => {
  it("readaloud (default): prefers read-aloud, audiobook always served", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const formats = acquisitionFormats(await buildAllBooks(context()))
    assert.deepStrictEqual(formats.get("apple orchard"), ["readaloud"])
    assert.deepStrictEqual(formats.get("Zebra Tales"), ["ebook"])
    assert.deepStrictEqual(formats.get("Mango"), ["audiobook-rpf"])
    assert.deepStrictEqual(formats.get("Banana Split"), [
      "audiobook-rpf",
      "ebook",
    ])
  })

  it("ebook: prefers the plain ebook, audiobook always served", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const formats = acquisitionFormats(
      await buildAllBooks(context({}, { format: "ebook" })),
    )
    assert.deepStrictEqual(formats.get("apple orchard"), ["ebook"])
    assert.deepStrictEqual(formats.get("Mango"), ["audiobook-rpf"])
  })

  it("both: serves read-aloud and ebook together", async () => {
    using ctx = setupTestDb()
    seedLibrary(ctx)

    const formats = acquisitionFormats(
      await buildAllBooks(context({}, { format: "both" })),
    )
    assert.deepStrictEqual(formats.get("apple orchard"), ["ebook", "readaloud"])
  })
})
