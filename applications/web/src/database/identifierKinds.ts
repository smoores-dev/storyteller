import { type IdentifierKind } from "./identifiers"

export type CoreIdentifierSpec = {
  kind: IdentifierKind
  displayName: string
  validate: (value: string) => boolean
  renderUrl: (
    value: string,
    siblings: ReadonlyMap<IdentifierKind, string>,
  ) => string | null
}

const DOI = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i
const ASIN = /^[A-Z0-9]{10}$/
const ISBN13_DIGITS = /^97[89]\d{10}$/
const HARDCOVER_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const HARDCOVER_EDITION_ID = /^\d+$/

function stripIsbnFormatting(value: string) {
  return value.replace(/[-\s]/g, "")
}

export const CORE_IDENTIFIERS: Record<IdentifierKind, CoreIdentifierSpec> = {
  doi: {
    kind: "doi",
    displayName: "DOI",
    validate: (value) => DOI.test(value.trim()),
    renderUrl: (value) => `https://doi.org/${encodeURI(value.trim())}`,
  },
  asin: {
    kind: "asin",
    displayName: "ASIN",
    validate: (value) => ASIN.test(value.trim()),
    renderUrl: (value) =>
      `https://www.amazon.com/dp/${encodeURIComponent(value.trim())}`,
  },
  audible: {
    kind: "audible",
    displayName: "Audible ASIN",
    validate: (value) => ASIN.test(value.trim()),
    renderUrl: (value) =>
      `https://www.audible.com/pd/${encodeURIComponent(value.trim())}`,
  },
  "isbn-13": {
    kind: "isbn-13",
    displayName: "ISBN-13",
    validate: (value) => ISBN13_DIGITS.test(stripIsbnFormatting(value)),
    renderUrl: (value) => {
      const digits = stripIsbnFormatting(value)
      return `https://isbnsearch.org/isbn/${digits}`
    },
  },
  "hardcover-book-slug": {
    kind: "hardcover-book-slug",
    displayName: "Hardcover Book Slug",
    validate: (value) => HARDCOVER_SLUG.test(value.trim()),
    renderUrl: (value) =>
      `https://hardcover.app/books/${encodeURIComponent(value.trim())}`,
  },
  "hardcover-book-id": {
    kind: "hardcover-book-id",
    displayName: "Hardcover Book ID",
    validate: (value) => HARDCOVER_EDITION_ID.test(value.trim()),
    renderUrl: (_value, siblings) => {
      const slug = siblings.get("hardcover-book-slug")
      if (!slug) return null
      return `https://hardcover.app/books/${encodeURIComponent(slug.trim())}`
    },
  },
  "hardcover-edition-id": {
    kind: "hardcover-edition-id",
    displayName: "Hardcover Edition ID",
    validate: (value) => HARDCOVER_EDITION_ID.test(value.trim()),
    renderUrl: (value, siblings) => {
      const slug = siblings.get("hardcover-book-slug")
      if (!slug) return null
      return `https://hardcover.app/books/${encodeURIComponent(slug.trim())}/editions/${encodeURIComponent(value.trim())}`
    },
  },
}

export function getCoreIdentifier(
  kind: string | null | undefined,
): CoreIdentifierSpec | null {
  if (!kind) return null
  return (
    (CORE_IDENTIFIERS as Record<string, CoreIdentifierSpec | undefined>)[
      kind
    ] ?? null
  )
}

export function renderIdentifierUrl(
  identifier: {
    kind: IdentifierKind | null
    urlTemplate: string | null
  },
  value: string,
  siblings: ReadonlyMap<IdentifierKind, string>,
): string | null {
  const core = getCoreIdentifier(identifier.kind)
  if (core) return core.renderUrl(value, siblings)
  if (!identifier.urlTemplate) return null
  return identifier.urlTemplate.replace("{value}", encodeURIComponent(value))
}

export function validateIdentifier(
  identifier: { kind: IdentifierKind | null },
  value: string,
): boolean {
  const core = getCoreIdentifier(identifier.kind)
  if (!core) return true
  return core.validate(value)
}
