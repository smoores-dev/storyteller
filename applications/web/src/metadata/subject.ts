import { type BookWithRelations } from "@/database/books"

import { type MatchSubject } from "./match"

const ISBN_KINDS = new Set(["isbn-13"])
const ASIN_KINDS = new Set(["asin", "audible"])

type IdentifierLike = { kind: string | null; value: string }

function collectIdentifiers(book: BookWithRelations): IdentifierLike[] {
  return [
    ...book.identifiers,
    ...(book.ebook?.identifiers ?? []),
    ...(book.audiobook?.identifiers ?? []),
    ...(book.readaloud?.identifiers ?? []),
  ]
}

export function subjectFromBook(book: BookWithRelations): MatchSubject {
  const identifiers = collectIdentifiers(book)
  const publicationYear = book.publicationDate
    ? new Date(book.publicationDate).getUTCFullYear()
    : null

  return {
    title: book.title,
    subtitle: book.subtitle,
    authors: book.authors.map((creator) => creator.name),
    narrators: book.narrators.map((creator) => creator.name),
    seriesNames: book.series.map((series) => series.name),
    publicationYear:
      publicationYear && !Number.isNaN(publicationYear)
        ? publicationYear
        : null,
    durationSeconds: book.duration,
    pageCount: book.pageCount,
    isbns: identifiers
      .filter(
        (identifier) => identifier.kind && ISBN_KINDS.has(identifier.kind),
      )
      .map((identifier) => identifier.value),
    asins: identifiers
      .filter(
        (identifier) => identifier.kind && ASIN_KINDS.has(identifier.kind),
      )
      .map((identifier) => identifier.value),
    hasAudiobook: !!book.audiobook,
    hasEbook: !!book.ebook || !!book.readaloud,
  }
}
