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
import { createTranslator } from "next-intl"
import { z } from "zod"

import { MediaType } from "@storyteller-platform/media-types"
import {
  ATOM_ACQ,
  ATOM_NAV,
  AcquisitionLink,
  Facet,
  Feed,
  FeedMetadata,
  NavigationLink,
  NavigationLinks,
  ProgressionLink,
  OPDSPublication,
  OPDS_AUTHENTICATION_JSON,
  OPDS_JSON,
  OPENSEARCH_XML,
  THUMBNAIL_REL,
} from "@storyteller-platform/opds"

import {
  type BookWithRelations,
  type GetBooksOptions,
  countBooks,
  getBooks,
} from "@/database/books"
import {
  type FacetValue,
  type FacetViewer,
  NONE_FACET_KEY,
  getSectionFacets,
} from "@/database/libraryCounts"
import { type OpdsFormat, OpdsFormatSchema } from "@/database/settingsTypes"
import { getShelfBooks } from "@/database/shelves"
import {
  FACET_BOOKS,
  type FacetBooksDef,
  type FacetBooksQuery,
  facetBooksQuery,
} from "@/facet-books"
import {
  FACET_SECTION_REGISTRY,
  OPDS_FACET_SECTIONS,
  type OpdsFacetSection,
  opdsSectionPath,
} from "@/facet-sections"
import { getFieldDef } from "@/fields"
import { type ShelfFilterNode } from "@/shelves"
import { GENERAL_SORT_FIELDS, type SortDirection, type SortField } from "@/sort"
import { getCoverUrl } from "@/store/api"
import type { UUID } from "@/uuid"

import messages from "../../messages/en.json"

const t = createTranslator({ locale: "en", messages })

const OpdsVersionSchema = z.enum(["v1", "v2"])
export type OpdsVersion = z.infer<typeof OpdsVersionSchema>

export interface OpdsSort {
  field: SortField
  direction: SortDirection
}

export interface BuildContext {
  version: OpdsVersion
  viewer: FacetViewer
  formats: OpdsFormat[]
  sort: OpdsSort
  pageSize: number | null
  page: number
  params: URLSearchParams
}

export const SEARCH_PARAM = "query"
const SORT_PARAM = "sort"
const ORDER_PARAM = "order"
const FORMAT_PARAM = "format"
const PAGE_PARAM = "page"

const KEPT_PARAMS = [SEARCH_PARAM, SORT_PARAM, ORDER_PARAM, FORMAT_PARAM]

const OrderSchema = z.enum(["asc", "desc"])

export const OpdsPageSchema = z.coerce.number().int().min(1).catch(1)

export const parseVersion = (raw: string | undefined): OpdsVersion | null =>
  OpdsVersionSchema.default("v1").safeParse(raw).data ?? null

export const baseFor = (version: OpdsVersion) =>
  version === "v2" ? "/opds/v2" : "/opds/v1"

export const searchPath = (version: OpdsVersion) => `${baseFor(version)}/search`

export const OPENSEARCH_PATH = "/opds/search.xml"

export const openSearchTemplate = () =>
  `${searchPath("v1")}?${SEARCH_PARAM}={searchTerms}`

export const createOpenSearchDescription = () => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${t("Opds.searchName")}</ShortName>
  <Description>${t("Opds.searchDescription")}</Description>
  <Url type="${ATOM_ACQ}"
     template="${openSearchTemplate()}" />
</OpenSearchDescription>`
}

const feedId = (selfPath: string): string => {
  const slug =
    selfPath.replace(/^\/opds\/v[12]\/?/, "").replace(/\//g, ":") || "catalog"
  return `urn:storyteller:opds:${slug}`
}

const feedType = (version: OpdsVersion, kind: "navigation" | "acquisition") => {
  if (version === "v2") {
    return OPDS_JSON
  }

  return kind === "navigation" ? ATOM_NAV : ATOM_ACQ
}

const searchLinks = (version: OpdsVersion): Link[] => {
  if (version === "v2") {
    return [
      new Link({
        href: `${searchPath(version)}{?${SEARCH_PARAM}}`,
        rels: new Set(["search"]),
        type: OPDS_JSON,
        templated: true,
      }),
    ]
  }

  return [
    new Link({
      href: OPENSEARCH_PATH,
      rels: new Set(["search"]),
      type: OPENSEARCH_XML,
    }),
    new Link({
      href: openSearchTemplate(),
      rels: new Set(["search"]),
      type: ATOM_ACQ,
    }),
  ]
}

const hrefWith = (
  path: string,
  params: URLSearchParams,
  changes: Record<string, string | null> = {},
): string => {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
  }

  const query = next.toString()
  return query ? `${path}?${query}` : path
}

const keptParams = (ctx: BuildContext): URLSearchParams => {
  const kept = new URLSearchParams()
  for (const key of KEPT_PARAMS) {
    const value = ctx.params.get(key)
    if (value) {
      kept.set(key, value)
    }
  }

  return kept
}

const defaultDirection = (field: SortField): SortDirection =>
  getFieldDef(field).defaultSort ?? "asc"

const parseSort = (
  ctx: BuildContext,
  allowed: readonly SortField[],
): OpdsSort | null => {
  const field = z.enum(allowed).safeParse(ctx.params.get(SORT_PARAM)).data
  if (!field) {
    return null
  }

  return {
    field,
    direction:
      OrderSchema.safeParse(ctx.params.get(ORDER_PARAM)).data ??
      defaultDirection(field),
  }
}

const parseFormat = (
  raw: string | null,
  choices: readonly OpdsFormat[],
): OpdsFormat | null => z.enum(choices).safeParse(raw).data ?? null

const authenticate = () =>
  new Properties({
    authenticate: new Link({
      href: "/opds/auth/auth.json",
      type: OPDS_AUTHENTICATION_JSON,
    }),
  })

function formatSuffix(format: OpdsFormat) {
  switch (format) {
    case "ebook": {
      return ""
    }
    case "audiobook": {
      return " (audiobook)"
    }
    case "readaloud": {
      return " (readaloud)"
    }
  }
}

function bookToMetadata(book: BookWithRelations, format: OpdsFormat) {
  return new Metadata({
    title: new LocalizedString(book.title + formatSuffix(format)),
    identifier: `urn:uuid:${book.uuid}`,
    typeUri: "http://schema.org/Book",
    subtitle: book.subtitle ? new LocalizedString(book.subtitle) : undefined,
    description: book.description ? he.decode(book.description) : undefined,
    languages: book.language ? [book.language] : undefined,
    published: book.publicationDate
      ? new Date(book.publicationDate)
      : undefined,
    duration:
      format === "ebook" ? undefined : (book[format]?.duration ?? undefined),
    numberOfPages:
      format === "audiobook"
        ? undefined
        : (book[format]?.pageCount ?? undefined),
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
}

/** maps a book row to an OPDS publication, shared by both projections */
export const bookToPublication = (
  book: BookWithRelations,
  formats: readonly OpdsFormat[] = OpdsFormatSchema.options,
): OPDSPublication[] => {
  const available: Record<OpdsFormat, boolean> = {
    readaloud:
      !!book.readaloud &&
      !book.readaloud.missing &&
      book.readaloud.status === "ALIGNED",
    ebook: !!book.ebook && !book.ebook.missing,
    audiobook: !!book.audiobook && !book.audiobook.missing,
  }

  const publications: OPDSPublication[] = []

  for (const format of OpdsFormatSchema.options) {
    if (!formats.includes(format) || !available[format]) {
      continue
    }

    const metadata = bookToMetadata(book, format)

    const links = [
      new ProgressionLink({
        href: `/api/v3/books/${book.uuid}/progress?format=${format}`,
        properties: authenticate(),
      }),
      new AcquisitionLink({
        href: `/api/v2/books/${book.uuid}/files?format=${format}`,
        rel: "acquisition",
        type:
          format === "audiobook"
            ? MediaType.AUDIOBOOK_PACKAGE.mime
            : MediaType.EPUB.mime,
      }),
    ]

    const images = [
      new Link({
        href: getCoverUrl(book.uuid, {
          ...(format === "audiobook"
            ? {
                height: 147,
                width: 147,
              }
            : {
                height: 225,
                width: 147,
              }),
          updatedAt: book.updatedAt,
          audio: format === "audiobook",
        }),
        rels: new Set([THUMBNAIL_REL]),
        type: MediaType.JPEG.mime,
        properties: authenticate(),
      }),
    ]

    publications.push(
      new OPDSPublication({
        metadata,
        links: new Links(links),
        images: new Links(images),
      }),
    )
  }

  return publications
}

const latestModified = (books: BookWithRelations[]): string => {
  if (books.length === 0) {
    return new Date().toISOString()
  }

  const latest = books.reduce((acc, book) => {
    const time = new Date(book.updatedAt).getTime()
    return Math.max(acc, time)
  }, 0)
  return new Date(latest).toISOString()
}

interface ResolvedPagination {
  currentPage: number
  pageSize: number
  offset: number
}

const resolvePagination = (ctx: BuildContext): ResolvedPagination | null => {
  if (!ctx.pageSize) {
    return null
  }

  return {
    currentPage: ctx.page,
    pageSize: ctx.pageSize,
    offset: (ctx.page - 1) * ctx.pageSize,
  }
}

const pageLinks = (
  ctx: BuildContext,
  kind: "navigation" | "acquisition",
  selfPath: string,
  pagination: ResolvedPagination | null,
  totalItems: number,
): Link[] => {
  const type = feedType(ctx.version, kind)
  const params = keptParams(ctx)
  const at = (page: number) =>
    hrefWith(selfPath, params, {
      [PAGE_PARAM]: page > 1 ? String(page) : null,
    })

  if (!pagination) {
    return [new Link({ href: at(1), rels: new Set(["self"]), type })]
  }

  const { currentPage, pageSize } = pagination
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const links: Link[] = [
    new Link({ href: at(currentPage), rels: new Set(["self"]), type }),
  ]
  if (currentPage > 1) {
    links.push(
      new Link({ href: at(1), rels: new Set(["first"]), type }),
      new Link({
        href: at(currentPage - 1),
        rels: new Set(["previous"]),
        type,
      }),
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

const andFilter = (
  a: ShelfFilterNode | undefined,
  b: ShelfFilterNode | undefined,
): ShelfFilterNode | undefined =>
  a && b ? { type: "and", children: [a, b] } : (a ?? b)

const withTiebreak = (sort: OpdsSort): OpdsSort[] =>
  sort.field === "title" ? [sort] : [sort, { field: "title", direction: "asc" }]

type BooksSource =
  | { kind: "query"; query: FacetBooksQuery & { search?: string } }
  | { kind: "shelf"; shelfUuid: UUID }

const fetchBooks = async (
  ctx: BuildContext,
  source: BooksSource,
  sort: OpdsSort | null,
  formats: readonly OpdsFormat[],
  pagination: ResolvedPagination | null,
): Promise<{ books: BookWithRelations[]; total: number }> => {
  const formatFilter: ShelfFilterNode = {
    type: "or",
    children: formats.map((value) => ({
      type: "condition",
      field: "format",
      operator: "is",
      value,
    })),
  }

  if (source.kind === "shelf") {
    const all = await getShelfBooks(source.shelfUuid, ctx.viewer.id, {
      filter: formatFilter,
      ...(sort
        ? { sortField: sort.field, orderDirection: sort.direction }
        : {}),
    })
    return {
      books: pagination
        ? all.slice(pagination.offset, pagination.offset + pagination.pageSize)
        : all,
      total: all.length,
    }
  }

  const filter = andFilter(source.query.filter, formatFilter)
  const opts: GetBooksOptions = {
    ...source.query,
    ...(filter ? { filter } : {}),
    ...(sort ? { sort: withTiebreak(sort) } : {}),
  }
  const [books, total] = await Promise.all([
    getBooks(null, ctx.viewer.id, {
      ...opts,
      ...(pagination
        ? { limit: pagination.pageSize, offset: pagination.offset }
        : {}),
    }),
    countBooks(ctx.viewer.id, opts),
  ])
  return { books, total }
}

const sortLabel = (field: SortField) => t(`Common.fields.label.${field}`)

const feedFacets = (
  ctx: BuildContext,
  selfPath: string,
  activeSort: OpdsSort | null,
  sortFields: readonly SortField[],
  formatChoices: readonly OpdsFormat[],
  format: OpdsFormat | null,
): Facet[] => {
  const params = keptParams(ctx)
  const type = feedType(ctx.version, "acquisition")
  const facetLink = (
    changes: Record<string, string | null>,
    title: string,
    active: boolean,
  ) =>
    new Link({
      href: hrefWith(selfPath, params, changes),
      title,
      type,
      ...(active ? { rels: new Set(["self"]) } : {}),
    })
  const facet = (title: string, links: Link[]) =>
    new Facet({
      metadata: new FeedMetadata({ title }),
      links: new Links(links),
    })

  const facets: Facet[] = []
  if (sortFields.length > 0) {
    facets.push(
      facet(
        t("Opds.sortBy"),
        sortFields.map((field) =>
          facetLink(
            { [SORT_PARAM]: field, [ORDER_PARAM]: defaultDirection(field) },
            sortLabel(field),
            activeSort?.field === field,
          ),
        ),
      ),
    )
  }

  if (sortFields.length > 0 && activeSort) {
    facets.push(
      facet(
        t("Opds.order"),
        (["asc", "desc"] as const).map((direction) =>
          facetLink(
            { [SORT_PARAM]: activeSort.field, [ORDER_PARAM]: direction },
            t(`Opds.${direction}`),
            activeSort.direction === direction,
          ),
        ),
      ),
    )
  }

  if (formatChoices.length > 1) {
    facets.push(
      facet(t("Opds.format"), [
        facetLink({ [FORMAT_PARAM]: null }, t("Opds.allFormats"), !format),
        ...formatChoices.map((value) =>
          facetLink(
            { [FORMAT_PARAM]: value },
            t(`Opds.formats.${value}`),
            format === value,
          ),
        ),
      ]),
    )
  }

  return facets
}

interface BooksFeedOptions {
  title: string
  selfPath: string
  source: BooksSource
  sort: OpdsSort | null
  sortFields: readonly SortField[]
  formats?: OpdsFormat[]
}

const buildBooksFeed = async (
  ctx: BuildContext,
  options: BooksFeedOptions,
): Promise<Feed> => {
  const pagination = resolvePagination(ctx)
  const sort = parseSort(ctx, options.sortFields) ?? options.sort
  const formatChoices = options.formats ?? ctx.formats
  const format = parseFormat(ctx.params.get(FORMAT_PARAM), formatChoices)
  const formats = format ? [format] : formatChoices
  const { books, total } = await fetchBooks(
    ctx,
    options.source,
    sort,
    formats,
    pagination,
  )

  return new Feed({
    metadata: new FeedMetadata({
      title: options.title,
      identifier: feedId(options.selfPath),
      modified: latestModified(books),
      numberOfItems: total,
      ...(pagination
        ? {
            itemsPerPage: pagination.pageSize,
            currentPage: pagination.currentPage,
          }
        : {}),
    }),
    links: new Links([
      ...pageLinks(ctx, "acquisition", options.selfPath, pagination, total),
      ...searchLinks(ctx.version),
    ]),
    publications: books.flatMap((book) => bookToPublication(book, formats)),
    facets: feedFacets(
      ctx,
      options.selfPath,
      sort,
      options.sortFields,
      formatChoices,
      format,
    ),
  })
}

const navLink = (
  ctx: BuildContext,
  href: string,
  title: string,
  kind: "navigation" | "acquisition",
  count?: number,
): NavigationLink =>
  new NavigationLink({
    href,
    title,
    rels: new Set(["subsection"]),
    type: feedType(ctx.version, kind),
    ...(count === undefined
      ? {}
      : { properties: new Properties({ numberOfItems: count }) }),
  })

const navFeed = (
  ctx: BuildContext,
  title: string,
  selfPath: string,
  entries: NavigationLink[],
  paginate: boolean,
): Feed => {
  const pagination = paginate ? resolvePagination(ctx) : null
  const shown = pagination
    ? entries.slice(pagination.offset, pagination.offset + pagination.pageSize)
    : entries

  return new Feed({
    metadata: new FeedMetadata({
      title,
      identifier: feedId(selfPath),
      ...(pagination
        ? {
            numberOfItems: entries.length,
            itemsPerPage: pagination.pageSize,
            currentPage: pagination.currentPage,
          }
        : {}),
    }),
    navigation: new NavigationLinks(shown),
    links: new Links([
      ...pageLinks(ctx, "navigation", selfPath, pagination, entries.length),
      ...searchLinks(ctx.version),
    ]),
  })
}

const sectionPath = (ctx: BuildContext, section: OpdsFacetSection) =>
  `${baseFor(ctx.version)}/${opdsSectionPath(section)}`

const valuePath = (ctx: BuildContext, section: OpdsFacetSection, key: string) =>
  `${sectionPath(ctx, section)}/${encodeURIComponent(key)}/books`

const sectionTitle = (section: OpdsFacetSection) =>
  t(`LibraryPage.${FACET_SECTION_REGISTRY[section].labelBase}.by`)

const valueName = (section: OpdsFacetSection, value: FacetValue): string => {
  const labelBase = FACET_SECTION_REGISTRY[section].labelBase
  if (value.key === NONE_FACET_KEY && labelBase !== "Formats") {
    return t(`LibraryPage.${labelBase}.none`)
  }

  const format =
    section === "formats"
      ? parseFormat(value.key, OpdsFormatSchema.options)
      : null
  if (format) {
    return t(`Opds.formats.${format}`)
  }

  return value.name
}

const sectionValues = async (
  ctx: BuildContext,
  section: OpdsFacetSection,
): Promise<FacetValue[]> =>
  (await getSectionFacets(ctx.viewer, section)).filter(
    (value) =>
      value.bookCount > 0 &&
      (section !== "formats" || parseFormat(value.key, ctx.formats) !== null),
  )

export const buildRootCatalog = async (ctx: BuildContext): Promise<Feed> => {
  const base = baseFor(ctx.version)
  const collections = await sectionValues(ctx, "collections")

  return navFeed(
    ctx,
    t("Opds.catalog"),
    base,
    [
      navLink(ctx, `${base}/books`, t("Opds.allBooks"), "acquisition"),
      ...OPDS_FACET_SECTIONS.map((section) =>
        navLink(
          ctx,
          sectionPath(ctx, section),
          sectionTitle(section),
          "navigation",
        ),
      ),
      ...collections
        .filter((value) => value.key !== NONE_FACET_KEY)
        .map((value) =>
          navLink(
            ctx,
            valuePath(ctx, "collections", value.key),
            value.name,
            "acquisition",
            value.bookCount,
          ),
        ),
    ],
    false,
  )
}

export const buildSectionNav = async (
  ctx: BuildContext,
  section: OpdsFacetSection,
): Promise<Feed> => {
  const values = await sectionValues(ctx, section)
  return navFeed(
    ctx,
    sectionTitle(section),
    sectionPath(ctx, section),
    values.map((value) =>
      navLink(
        ctx,
        valuePath(ctx, section, value.key),
        valueName(section, value),
        "acquisition",
        value.bookCount,
      ),
    ),
    true,
  )
}

export const buildSectionBooks = async (
  ctx: BuildContext,
  section: OpdsFacetSection,
  key: string,
): Promise<Feed | null> => {
  const value = (await sectionValues(ctx, section)).find((v) => v.key === key)
  if (!value) {
    return null
  }

  const def: FacetBooksDef = FACET_BOOKS[section]
  const title = valueName(section, value)
  const selfPath = valuePath(ctx, section, key)

  if (section === "shelves") {
    return buildBooksFeed(ctx, {
      title,
      selfPath,
      source: { kind: "shelf", shelfUuid: key as UUID },
      sort: null,
      sortFields: GENERAL_SORT_FIELDS,
    })
  }

  const query = facetBooksQuery(def, key)
  const format = section === "formats" ? parseFormat(key, ctx.formats) : null
  const inSeries = !!query.series
  const ownSort =
    def.sort && (def.sort.field !== "seriesPosition" || inSeries)
      ? def.sort
      : null

  return buildBooksFeed(ctx, {
    title,
    selfPath,
    source: { kind: "query", query },
    ...(format ? { formats: [format] } : {}),
    sort: ownSort ?? ctx.sort,
    sortFields: GENERAL_SORT_FIELDS,
  })
}

export const buildAllBooks = (ctx: BuildContext): Promise<Feed> =>
  buildBooksFeed(ctx, {
    title: t("Opds.allBooks"),
    selfPath: `${baseFor(ctx.version)}/books`,
    source: { kind: "query", query: {} },
    sort: ctx.sort,
    sortFields: GENERAL_SORT_FIELDS,
  })

export const buildSearchResults = (
  ctx: BuildContext,
  term: string | null,
): Promise<Feed> => {
  const search = term?.trim() || undefined
  return buildBooksFeed(ctx, {
    title: t("Opds.searchResults", { query: search ?? "" }),
    selfPath: searchPath(ctx.version),
    source: { kind: "query", query: search ? { search } : {} },
    sort: search ? null : ctx.sort,
    sortFields: search ? [] : GENERAL_SORT_FIELDS,
  })
}
