import {
  Contributor,
  Contributors,
  Link,
  Links,
  LocalizedString,
  Metadata,
  Properties,
  Subject,
  Subjects,
} from "@readium/shared"
import he from "he"

import { MediaType } from "@storyteller-platform/media-types"
import {
  ATOM_ACQ,
  ATOM_NAV,
  AcquisitionLink,
  Feed,
  FeedMetadata,
  NavigationLink,
  NavigationLinks,
  OPDSPublication,
  OPDS_AUTHENTICATION_JSON,
  OPDS_JSON,
  OPENSEARCH_XML,
  THUMBNAIL_REL,
} from "@storyteller-platform/opds"

import { type BookWithRelations, booksQuery, getBooks } from "@/database/books"
import {
  type CollectionWithRelations,
  getCollections,
} from "@/database/collections"
import { db } from "@/database/connection"
import { type Series, getSeries } from "@/database/series"
import type { OpdsFormat } from "@/database/settingsTypes"
import { type Tag, getTags } from "@/database/tags"
import { getCoverUrl } from "@/store/api"
import type { UUID } from "@/uuid"

export type OpdsVersion = "v1" | "v2"

export interface BuildContext {
  userId?: UUID
  version: OpdsVersion
  /** which acquisition formats books expose, defaults to readaloud + audiobook */
  format?: OpdsFormat
}

export interface PaginationInput {
  page: number
  pageSize: number | null | undefined
}

const baseFor = (version: OpdsVersion) =>
  version === "v2" ? "/opds/v2" : "/opds/v1"

const feedId = (selfPath: string): string => {
  const slug =
    selfPath.replace(/^\/opds\/v[12]\/?/, "").replace(/\//g, ":") || "catalog"
  return `urn:storyteller:opds:${slug}`
}

const feedType = (version: OpdsVersion, kind: "navigation" | "acquisition") => {
  if (version === "v2") return OPDS_JSON
  return kind === "navigation" ? ATOM_NAV : ATOM_ACQ
}

const searchLink = (version: OpdsVersion): Link => {
  if (version === "v2") {
    return new Link({
      href: `${baseFor(version)}/search{?query}`,
      rels: new Set(["search"]),
      type: OPDS_JSON,
      templated: true,
    })
  }
  return new Link({
    href: "/opds/search.xml",
    rels: new Set(["search"]),
    type: OPENSEARCH_XML,
  })
}

const authenticate = () =>
  new Properties({
    authenticate: new Link({
      href: "/opds/auth/auth.json",
      type: OPDS_AUTHENTICATION_JSON,
    }),
  })

/**
 * which formats to include
 */
const includedFormats = (
  format: OpdsFormat,
  has: { readaloud: boolean; ebook: boolean; audiobook: boolean },
) => {
  switch (format) {
    case "ebook":
      // prefer the plain ebook, fall back to readaloud when it's the only epub
      return {
        readaloud: has.readaloud && !has.ebook,
        ebook: has.ebook,
        audiobook: has.audiobook,
      }
    case "both":
      return {
        readaloud: has.readaloud,
        ebook: has.ebook,
        audiobook: has.audiobook,
      }
    case "readaloud":
    default:
      // prefer the readaloud, fall back to the plain ebook
      return {
        readaloud: has.readaloud,
        ebook: has.ebook && !has.readaloud,
        audiobook: has.audiobook,
      }
  }
}

/** maps a book row to an OPDS publication, shared by both projections */
export const bookToPublication = (
  book: BookWithRelations,
  format: OpdsFormat = "readaloud",
): OPDSPublication => {
  const hasEbook = !!book.ebook && !book.ebook.missing
  const hasAudiobook = !!book.audiobook && !book.audiobook.missing
  const hasReadaloud =
    !!book.readaloud &&
    !book.readaloud.missing &&
    book.readaloud.status === "ALIGNED"

  const include = includedFormats(format, {
    readaloud: hasReadaloud,
    ebook: hasEbook,
    audiobook: hasAudiobook,
  })

  const links: Link[] = []
  if (include.readaloud) {
    links.push(
      new AcquisitionLink({
        href: `/api/v2/books/${book.uuid}/files?format=readaloud`,
        rel: "acquisition",
        type: MediaType.EPUB.mime,
      }),
    )
  }
  if (include.ebook) {
    links.push(
      new AcquisitionLink({
        href: `/api/v2/books/${book.uuid}/files?format=ebook`,
        rel: "acquisition",
        type: MediaType.EPUB.mime,
      }),
    )
  }
  if (include.audiobook) {
    links.push(
      new AcquisitionLink({
        href: `/api/v2/books/${book.uuid}/files?format=audiobook-rpf`,
        rel: "acquisition",
        type: MediaType.AUDIOBOOK_PACKAGE.mime,
      }),
    )
  }

  // one cover: portrait for text, square for audio-only (matches legacy).
  const images: Link[] = []
  if (include.readaloud || include.ebook) {
    images.push(
      new Link({
        href: getCoverUrl(book.uuid, {
          height: 225,
          width: 147,
          updatedAt: book.updatedAt,
        }),
        rels: new Set([THUMBNAIL_REL]),
        type: MediaType.JPEG.mime,
        properties: authenticate(),
      }),
    )
  } else if (include.audiobook) {
    images.push(
      new Link({
        href: getCoverUrl(book.uuid, {
          height: 147,
          width: 147,
          updatedAt: book.updatedAt,
          audio: true,
        }),
        rels: new Set([THUMBNAIL_REL]),
        type: MediaType.JPEG.mime,
        properties: authenticate(),
      }),
    )
  }

  const metadata = new Metadata({
    title: new LocalizedString(book.title),
    identifier: `urn:uuid:${book.uuid}`,
    typeUri: "http://schema.org/Book",
    subtitle: book.subtitle ? new LocalizedString(book.subtitle) : undefined,
    description: book.description ? he.decode(book.description) : undefined,
    languages: book.language ? [book.language] : undefined,
    published: book.publicationDate
      ? new Date(book.publicationDate)
      : undefined,
    duration: book.audiobook?.duration ?? book.readaloud?.duration ?? undefined,
    numberOfPages:
      book.ebook?.pageCount ?? book.readaloud?.pageCount ?? undefined,
    authors: new Contributors(
      book.authors.map(
        (author) =>
          new Contributor({
            name: new LocalizedString(author.name),
            roles: new Set(["aut"]),
          }),
      ),
    ),
    narrators: book.narrators.length
      ? new Contributors(
          book.narrators.map(
            (narrator) =>
              new Contributor({
                name: new LocalizedString(narrator.name),
                roles: new Set(["narrator"]),
              }),
          ),
        )
      : undefined,
    subjects: new Subjects(
      book.tags.map(
        (tag) => new Subject({ name: new LocalizedString(tag.name) }),
      ),
    ),
    belongsToSeries: book.series.length
      ? new Contributors(
          book.series.map(
            (series) =>
              new Contributor({
                name: new LocalizedString(series.name),
                position: series.position ?? undefined,
              }),
          ),
        )
      : undefined,
  })

  return new OPDSPublication({
    metadata,
    links: new Links(links),
    images: images.length ? new Links(images) : undefined,
  })
}

const latestModified = (books: BookWithRelations[]): string => {
  if (books.length === 0) return new Date().toISOString()
  const latest = books.reduce((acc, book) => {
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
    const time = new Date(book.updatedAt as Date | string).getTime()
    return Math.max(acc, time)
  }, 0)
  return new Date(latest).toISOString()
}

interface ResolvedPagination {
  currentPage: number
  pageSize: number
  offset: number
}

const resolvePagination = (
  input?: PaginationInput,
): ResolvedPagination | null => {
  if (!input?.pageSize) return null
  const currentPage = Math.max(1, input.page)
  return {
    currentPage,
    pageSize: input.pageSize,
    offset: (currentPage - 1) * input.pageSize,
  }
}

/** self + first/previous/next/last links for a paginated acquisition feed */
const paginationLinks = (
  version: OpdsVersion,
  selfPath: string,
  pagination: ResolvedPagination,
  totalItems: number,
): Link[] => {
  const type = feedType(version, "acquisition")
  const { currentPage, pageSize } = pagination
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const at = (page: number) => `${selfPath}?page=${page}`

  const links: Link[] = [
    new Link({ href: selfPath, rels: new Set(["self"]), type }),
  ]
  if (currentPage > 1) {
    links.push(
      new Link({
        href: at(currentPage - 1),
        rels: new Set(["previous"]),
        type,
      }),
      new Link({ href: at(1), rels: new Set(["first"]), type }),
    )
  }
  if (currentPage < totalPages) {
    links.push(
      new Link({ href: at(currentPage + 1), rels: new Set(["next"]), type }),
      new Link({ href: at(totalPages), rels: new Set(["last"]), type }),
    )
  }
  return links
}

interface BooksFeedOptions {
  title: string
  selfPath: string
  pagination?: ResolvedPagination
  totalItems?: number
  format?: OpdsFormat
}

/** common acquisition-feed assembly shared by every book listing. */
const booksFeed = (
  version: OpdsVersion,
  books: BookWithRelations[],
  options: BooksFeedOptions,
): Feed => {
  const links: Link[] = []
  if (options.pagination) {
    links.push(
      ...paginationLinks(
        version,
        options.selfPath,
        options.pagination,
        options.totalItems ?? books.length,
      ),
    )
  } else {
    links.push(
      new Link({
        href: options.selfPath,
        rels: new Set(["self"]),
        type: feedType(version, "acquisition"),
      }),
    )
  }
  links.push(searchLink(version))

  return new Feed({
    metadata: new FeedMetadata({
      title: options.title,
      identifier: feedId(options.selfPath),
      modified: latestModified(books),
      ...(options.pagination
        ? {
            itemsPerPage: options.pagination.pageSize,
            currentPage: options.pagination.currentPage,
            numberOfItems: options.totalItems ?? books.length,
          }
        : {}),
    }),
    links: new Links(links),
    publications: books.map((book) => bookToPublication(book, options.format)),
  })
}

const navLink = (
  version: OpdsVersion,
  href: string,
  title: string,
  kind: "navigation" | "acquisition",
): NavigationLink =>
  new NavigationLink({
    href,
    title,
    rels: new Set(["subsection"]),
    type: feedType(version, kind),
  })

/** the root catalog: navigation to books/collections/series/tags. */
export const buildRootCatalog = async (ctx: BuildContext): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const collections = await getCollections(ctx.userId)

  const navigation = new NavigationLinks([
    navLink(ctx.version, `${base}/books`, "All Books", "navigation"),
    navLink(ctx.version, `${base}/collections`, "Collections", "navigation"),
    navLink(ctx.version, `${base}/series`, "Series", "navigation"),
    navLink(ctx.version, `${base}/tags`, "Tags", "navigation"),
    ...collections.map((collection) =>
      navLink(
        ctx.version,
        `${base}/collections/${collection.uuid}/books`,
        collection.name,
        "navigation",
      ),
    ),
  ])

  return new Feed({
    metadata: new FeedMetadata({
      title: "Storyteller Catalog",
      identifier: feedId(base),
    }),
    navigation,
    links: new Links([
      new Link({
        href: base,
        rels: new Set(["self"]),
        type: feedType(ctx.version, "navigation"),
      }),
      searchLink(ctx.version),
    ]),
  })
}

/** a navigation feed listing sub-feeds (series/tags/collections) */
const navFeed = (
  ctx: BuildContext,
  title: string,
  selfPath: string,
  entries: NavigationLink[],
): Feed =>
  new Feed({
    metadata: new FeedMetadata({ title, identifier: feedId(selfPath) }),
    navigation: new NavigationLinks(entries),
    links: new Links([
      new Link({
        href: selfPath,
        rels: new Set(["self"]),
        type: feedType(ctx.version, "navigation"),
      }),
      searchLink(ctx.version),
    ]),
  })

export const buildAllBooks = async (
  ctx: BuildContext,
  formatFilter?: "ebook" | "audiobook" | "readaloud",
  pagination?: PaginationInput,
): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const resolved = resolvePagination(pagination)

  const total = await db
    .selectFrom("book")
    .select((eb) => eb.fn.count<number>("book.uuid").as("count"))
    .executeTakeFirst()
  const totalItems = total?.count ?? 0

  let query = booksQuery(ctx.userId)
  if (resolved) query = query.limit(resolved.pageSize).offset(resolved.offset)
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

  const label =
    formatFilter === "readaloud"
      ? "Read Aloud"
      : formatFilter
        ? formatFilter.charAt(0).toUpperCase() + formatFilter.slice(1)
        : null

  return booksFeed(ctx.version, books, {
    title: label ? `All ${label} Books` : "All Books",
    selfPath: `${base}/books`,
    pagination: resolved ?? undefined,
    totalItems,
    format: ctx.format,
  })
}

export const buildSeriesNav = async (ctx: BuildContext): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const series = await getSeries(ctx.userId)
  return navFeed(
    ctx,
    "Series",
    `${base}/series`,
    series.map((entry) =>
      navLink(
        ctx.version,
        `${base}/series/${entry.uuid}/books`,
        entry.name,
        "acquisition",
      ),
    ),
  )
}

export const buildSeriesBooks = async (
  ctx: BuildContext,
  series: Series,
  pagination?: PaginationInput,
): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const resolved = resolvePagination(pagination)

  let query = booksQuery(ctx.userId)
    .innerJoin("bookToSeries", "book.uuid", "bookToSeries.bookUuid")
    .where("bookToSeries.seriesUuid", "=", series.uuid)
    .orderBy("updatedAt", "desc")

  const total = await query
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirst()
  const totalItems = total?.count ?? 0

  if (resolved) query = query.limit(resolved.pageSize).offset(resolved.offset)
  const books = await query.selectAll("book").execute()

  return booksFeed(ctx.version, books, {
    title: `${series.name} Books`,
    selfPath: `${base}/series/${series.uuid}/books`,
    pagination: resolved ?? undefined,
    totalItems,
    format: ctx.format,
  })
}

export const buildTagsNav = async (ctx: BuildContext): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const tags = await getTags(ctx.userId)
  return navFeed(
    ctx,
    "Tags",
    `${base}/tags`,
    tags.map((tag) =>
      navLink(
        ctx.version,
        `${base}/tags/${tag.uuid}/books`,
        tag.name,
        "acquisition",
      ),
    ),
  )
}

export const buildTagBooks = async (
  ctx: BuildContext,
  tag: Tag,
  pagination?: PaginationInput,
): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const resolved = resolvePagination(pagination)

  let query = booksQuery(ctx.userId)
    .innerJoin("bookToTag", "book.uuid", "bookToTag.bookUuid")
    .where("bookToTag.tagUuid", "=", tag.uuid)

  const total = await query
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .executeTakeFirst()
  const totalItems = total?.count ?? 0

  if (resolved) query = query.limit(resolved.pageSize).offset(resolved.offset)
  const books = await query.selectAll("book").execute()

  return booksFeed(ctx.version, books, {
    title: `${tag.name} Books`,
    selfPath: `${base}/tags/${tag.uuid}/books`,
    pagination: resolved ?? undefined,
    totalItems,
    format: ctx.format,
  })
}

export const buildCollectionsNav = async (ctx: BuildContext): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const collections = await getCollections(ctx.userId)
  return navFeed(
    ctx,
    "Collections",
    `${base}/collections`,
    collections.map((collection) =>
      navLink(
        ctx.version,
        `${base}/collections/${collection.uuid}/books`,
        collection.name,
        "acquisition",
      ),
    ),
  )
}

export const buildCollectionBooks = async (
  ctx: BuildContext,
  collection: CollectionWithRelations,
  pagination?: PaginationInput,
): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const resolved = resolvePagination(pagination)

  let query = booksQuery(ctx.userId)
    .innerJoin("bookToCollection as btc", "book.uuid", "btc.bookUuid")
    .where("btc.collectionUuid", "=", collection.uuid)

  const total = await db
    .selectFrom("bookToCollection")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("collectionUuid", "=", collection.uuid)
    .executeTakeFirst()
  const totalItems = total?.count ?? 0

  if (resolved) query = query.limit(resolved.pageSize).offset(resolved.offset)
  const books = await query.selectAll("book").execute()

  return booksFeed(ctx.version, books, {
    title: `${collection.name} Books`,
    selfPath: `${base}/collections/${collection.uuid}/books`,
    pagination: resolved ?? undefined,
    totalItems,
    format: ctx.format,
  })
}

export const buildSearchResults = async (
  ctx: BuildContext,
  search: string | null,
): Promise<Feed> => {
  const base = baseFor(ctx.version)
  // TODO: quite inefficient, replace with sqlite search at some point
  // this will be added in v3, remember to update
  const allBooks = await getBooks(null, ctx.userId)
  const books = allBooks.filter((book) =>
    book.title.toLowerCase().includes(search?.toLowerCase() ?? ""),
  )

  return booksFeed(ctx.version, books, {
    title: `Search Results for ${search ?? ""}`,
    selfPath: `${base}/search`,
    format: ctx.format,
  })
}
