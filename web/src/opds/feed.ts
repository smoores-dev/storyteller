import he from "he"
import { Entry, Feed } from "opds-ts/v1.2"

import { type BookWithRelations, booksQuery } from "@/database/books"
import {
  type CollectionWithRelations,
  getCollections,
} from "@/database/collections"
import { db } from "@/database/connection"
import { type Series, getSeries } from "@/database/series"
import { type Tag, getTags } from "@/database/tags"
import { getCoverUrl } from "@/store/api"
import type { UUID } from "@/uuid"

export interface OPDSOptions {
  userId?: UUID
}

export interface PaginationOptions {
  page?: number
  pageSize?: number
}

/**
 * Create the root OPDS catalog feed
 */
export async function createRootCatalog(options: OPDSOptions) {
  const collections = await getCollections(options.userId)

  const opdsBase = `/opds`

  const feed = new Feed("catalog", "Storyteller Catalog")
    .addSelfLink(opdsBase, "navigation")
    .setKind("navigation")
    .addEntries([
      new Entry("books", "All Books").addLink({
        href: `${opdsBase}/books`,
        rel: "subsection",
        type: "application/atom+xml;profile=opds-catalog;kind=navigation",
      }),
      new Entry("collections", "Collections").addLink({
        href: `${opdsBase}/collections`,
        rel: "subsection",
        type: "application/atom+xml;profile=opds-catalog;kind=navigation",
      }),
      new Entry("series", "Series").addLink({
        href: `${opdsBase}/series`,
        rel: "subsection",
        type: "application/atom+xml;profile=opds-catalog;kind=navigation",
      }),
      new Entry("tags", "Tags").addLink({
        href: `${opdsBase}/tags`,
        rel: "subsection",
        type: "application/atom+xml;profile=opds-catalog;kind=navigation",
      }),
    ])
    .addEntries(
      collections.map((collection) =>
        new Entry(`collection:${collection.uuid}`, collection.name)
          .setSummary(
            `${collection.name}${collection.description ? `: ${he.decode(collection.description)}` : ""}`,
          )
          .setUpdated(collection.updatedAt)
          .addLink({
            href: `${opdsBase}/collections/${collection.uuid}/books`,
            rel: "subsection",
            type: "application/atom+xml;profile=opds-catalog;kind=navigation",
          }),
      ),
    )

  addSearchToFeed(feed)

  return feed
}

/**
 * Helper to get the correct file extension for a book format
 */
export function getBookFileExtension(
  _book: BookWithRelations,
  format: "ebook" | "audiobook" | "readaloud",
): string {
  if (format === "ebook" || format === "readaloud") {
    return "epub"
  }
  return "audiobook"
}

export function createBooksFeed(
  books: BookWithRelations[],
  options: {
    title: string
    feedTitle: string
    feedId: string
  },
  pagination?: {
    currentPage: number
    pageSize: number
    totalItems: number
    selfUrl: string
  },
) {
  const entries = books.map((book) => {
    const hasEbook = book.ebook && !book.ebook.missing
    const hasAudiobook = book.audiobook && !book.audiobook.missing
    const hasReadaloud =
      book.readaloud &&
      !book.readaloud.missing &&
      book.readaloud.status === "ALIGNED"

    const entry = new Entry(`book:${book.uuid}`, book.title)
      .setSummary(he.decode(book.description ?? ""))
      .setUpdated(book.updatedAt)
      .setAuthor(book.authors.map((author) => author.name).join(", "))

    if (hasEbook || hasReadaloud) {
      entry.addLink({
        href: getCoverUrl(book.uuid, {
          height: 225,
          width: 147,
          updatedAt: book.updatedAt,
        }),
        rel: "http://opds-spec.org/image/thumbnail",
        type: "image/jpeg",
        properties: {
          authenticate: true,
        },
      })
    } else if (hasAudiobook) {
      entry.addLink({
        href: getCoverUrl(book.uuid, {
          height: 147,
          width: 147,
          updatedAt: book.updatedAt,
          audio: true,
        }),
        rel: "http://opds-spec.org/image/thumbnail",
        type: "image/jpeg",
        properties: {
          authenticate: true,
        },
      })
    }

    // prefer readaloud when available since it includes audio sync
    if (hasReadaloud) {
      entry.addAcquisition(
        `/api/v2/books/${book.uuid}/files?format=readaloud`,
        "application/epub+zip",
      )
    }

    // also offer the standalone ebook since most clients don't support readalouds
    if (hasEbook) {
      entry.addAcquisition(
        `/api/v2/books/${book.uuid}/files?format=ebook`,
        "application/epub+zip",
      )
    }

    if (hasAudiobook) {
      entry.addAcquisition(
        `/api/v2/books/${book.uuid}/files?format=audiobook-rpf`,
        "application/audiobook+zip",
      )
    }

    return entry
  })

  const lastUpdated =
    books.length > 0
      ? books.reduce((latest, book) => {
          const date = new Date(book.updatedAt as Date | string)
          return Math.max(latest, date.getTime())
        }, 0)
      : Date.now()
  const updatedAt = new Date(lastUpdated).toISOString()

  const feed = new Feed(options.feedId, options.feedTitle)
    .setKind("acquisition")
    .setUpdated(updatedAt)
    .addEntries(entries)

  if (pagination) {
    const { currentPage, pageSize, totalItems, selfUrl } = pagination
    const totalPages = Math.ceil(totalItems / pageSize)

    const url = new URL(selfUrl)

    feed.addSelfLink(url.pathname, "acquisition")

    if (currentPage > 1) {
      url.searchParams.set("page", String(currentPage - 1))
      feed.addLink({
        href: `${url.pathname}?${url.searchParams.toString()}`,
        rel: "previous",
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      })

      url.searchParams.set("page", "1")
      feed.addLink({
        href: `${url.pathname}?${url.searchParams.toString()}`,
        rel: "first",
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      })
    }

    if (currentPage < totalPages) {
      url.searchParams.set("page", String(currentPage + 1))
      feed.addLink({
        href: `${url.pathname}?${url.searchParams.toString()}`,
        rel: "next",
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      })

      url.searchParams.set("page", String(totalPages))
      feed.addLink({
        href: `${url.pathname}?${url.searchParams.toString()}`,
        rel: "last",
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      })
    }
  }

  feed.addLink({
    href: "/opds/search.xml",
    rel: "search",
    type: "application/opensearchdescription+xml",
  })

  return feed
}

export async function createCollectionAcquisitionFeed(
  options: OPDSOptions,
  collection: CollectionWithRelations,
  pagination?: { currentPage: number; pageSize: number; selfUrl: string },
) {
  let query = booksQuery(options.userId)
    .innerJoin("bookToCollection as btc", "book.uuid", "btc.bookUuid")
    .where("btc.collectionUuid", "=", collection.uuid)

  const totalItems = await db
    .selectFrom("bookToCollection")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("collectionUuid", "=", collection.uuid)
    .executeTakeFirst()
    .then((result) => result?.count ?? 0)

  if (pagination) {
    const offset = (pagination.currentPage - 1) * pagination.pageSize
    query = query.limit(pagination.pageSize).offset(offset)
  }

  const books = await query.selectAll("book").execute()

  const feed = createBooksFeed(
    books,
    {
      title: collection.name,
      feedTitle: `${collection.name} Books`,
      feedId: `collection:${collection.uuid}`,
    },
    pagination
      ? {
          currentPage: pagination.currentPage,
          pageSize: pagination.pageSize,
          totalItems,
          selfUrl: pagination.selfUrl,
        }
      : undefined,
  )

  return feed
}

export async function createCollectionNavFeed(options: OPDSOptions) {
  const collections = await getCollections(options.userId)

  const feed = new Feed("collection", "Collection")
    .setKind("navigation")
    .addEntries(
      collections.map((collection) =>
        new Entry(`collection:${collection.uuid}`, collection.name).addLink({
          href: `/opds/collections/${collection.uuid}/books`,
          rel: "subsection",
          type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
        }),
      ),
    )
  addSearchToFeed(feed)
  return feed
}

export type BookSortColumn =
  | "updatedAt"
  | "createdAt"
  | "publicationDate"
  | "title"
export type BookSortOptions = {
  sortBy: BookSortColumn
  sortOrder: "asc" | "desc"
}

export async function createSeriesAcquisitionFeed(
  options: OPDSOptions,
  series: Series,
  sortOptions: BookSortOptions,
  pagination?: { currentPage: number; pageSize: number; selfUrl: string },
) {
  let query = booksQuery(options.userId)
    .innerJoin("bookToSeries", "book.uuid", "bookToSeries.bookUuid")
    .where("bookToSeries.seriesUuid", "=", series.uuid)
    .orderBy(sortOptions.sortBy, sortOptions.sortOrder)

  const totalItems = await query
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirst()
    .then((result) => result?.count ?? 0)

  if (pagination) {
    const offset = (pagination.currentPage - 1) * pagination.pageSize
    query = query.limit(pagination.pageSize).offset(offset)
  }

  const books = await query.selectAll("book").execute()

  const feed = createBooksFeed(
    books,
    {
      title: series.name,
      feedTitle: `${series.name} Books`,
      feedId: `series:${series.uuid}`,
    },
    pagination
      ? {
          currentPage: pagination.currentPage,
          pageSize: pagination.pageSize,
          totalItems,
          selfUrl: pagination.selfUrl,
        }
      : undefined,
  )

  if (!pagination) {
    feed.addSelfLink(`/opds/series/${series.uuid}/books`, "acquisition")
  }

  return feed
}

export async function createSeriesNavFeed(options: OPDSOptions) {
  const series = await getSeries(options.userId)

  const feed = new Feed("series", "Series").setKind("navigation").addEntries(
    series.map((series) =>
      new Entry(`series:${series.uuid}`, series.name).addLink({
        href: `/opds/series/${series.uuid}/books`,
        rel: "subsection",
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      }),
    ),
  )

  feed.addSelfLink(`/opds/series`, "navigation")

  return feed
}

export async function createTagAcquisitionFeed(
  options: OPDSOptions,
  tag: Tag,
  pagination?: { currentPage: number; pageSize: number; selfUrl: string },
) {
  let query = booksQuery(options.userId)
    .innerJoin("bookToTag", "book.uuid", "bookToTag.bookUuid")
    .where("bookToTag.tagUuid", "=", tag.uuid)

  const totalItems = await query
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirst()
    .then((result) => result?.count ?? 0)

  if (pagination) {
    const offset = (pagination.currentPage - 1) * pagination.pageSize
    query = query.limit(pagination.pageSize).offset(offset)
  }

  const books = await query.selectAll("book").execute()

  const feed = createBooksFeed(
    books,
    {
      title: tag.name,
      feedTitle: `${tag.name} Books`,
      feedId: `tag:${tag.uuid}`,
    },
    pagination
      ? {
          currentPage: pagination.currentPage,
          pageSize: pagination.pageSize,
          totalItems,
          selfUrl: pagination.selfUrl,
        }
      : undefined,
  )

  if (!pagination) {
    feed.addSelfLink(`/opds/tags/${tag.uuid}/books`, "acquisition")
  }

  return feed
}

export async function createTagsNavFeed(options: OPDSOptions) {
  const tags = await getTags(options.userId)

  const feed = new Feed("tags", "Tags").setKind("navigation").addEntries(
    tags.map((tag) =>
      new Entry(`tag:${tag.uuid}`, tag.name).addLink({
        href: `/opds/tags/${tag.uuid}/books`,
        rel: "subsection",
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      }),
    ),
  )

  feed.addSelfLink(`/opds/tags`, "navigation")

  addSearchToFeed(feed)

  return feed
}

export async function createAllBooksAcquisitionFeed(
  options: OPDSOptions,
  formatFilter?: "ebook" | "audiobook" | "readaloud",
  pagination?: { currentPage: number; pageSize: number; selfUrl: string },
) {
  let query = booksQuery(options.userId)

  const totalItemsQuery = await db
    .selectFrom("book")
    .select((eb) => eb.fn.count<number>("book.uuid").as("count"))
    .executeTakeFirst()

  const totalItems = totalItemsQuery?.count ?? 0

  if (pagination) {
    const offset = (pagination.currentPage - 1) * pagination.pageSize
    query = query.limit(pagination.pageSize).offset(offset)
  }

  const allBooks = await query.selectAll("book").execute()

  let books = allBooks
  if (formatFilter === "ebook") {
    books = allBooks.filter((book) => book.ebook && !book.ebook.missing)
  } else if (formatFilter === "audiobook") {
    books = allBooks.filter((book) => book.audiobook && !book.audiobook.missing)
  } else if (formatFilter === "readaloud") {
    books = allBooks.filter(
      (book) =>
        book.readaloud &&
        !book.readaloud.missing &&
        book.readaloud.status === "ALIGNED",
    )
  }

  const feed = createBooksFeed(
    books,
    {
      title: "All Books",
      feedTitle: formatFilter
        ? `All ${formatFilter === "readaloud" ? "Read Aloud" : formatFilter.charAt(0).toUpperCase() + formatFilter.slice(1)} Books`
        : "All Books",
      feedId: "books",
    },
    pagination
      ? {
          currentPage: pagination.currentPage,
          pageSize: pagination.pageSize,
          totalItems,
          selfUrl: pagination.selfUrl,
        }
      : undefined,
  )

  if (!pagination) {
    feed.addSelfLink(`/opds/books`, "acquisition")
  }

  return feed
}

export function addSearchToFeed(feed: Feed) {
  // check if feed already has a search link
  if (feed.getLinks().some((link) => link.rel === "search")) {
    return
  }

  feed.addLink({
    href: "/opds/search.xml",
    rel: "search",
    type: "application/opensearchdescription+xml",
  })
}
