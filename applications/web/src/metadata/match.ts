import {
  type BookMetadataCandidate,
  type BookMetadataProvider,
  type BookMetadataSearchResult,
  type MetadataEdition,
} from "@storyteller-platform/nodekit/types"

export type MatchSubject = {
  title: string
  subtitle?: string | null
  authors: string[]
  narrators: string[]
  seriesNames: string[]
  publicationYear?: number | null
  durationSeconds?: number | null
  pageCount?: number | null
  isbns: string[]
  asins: string[]
  hasAudiobook: boolean
  hasEbook: boolean
}

export type MatchCandidate = {
  provider: BookMetadataProvider
  id: string
  editionId?: string
  title: string
  subtitle?: string | null
  authors: string[]
  narrators: string[]
  seriesNames: string[]
  publicationYear?: number | null
  durationSeconds?: number | null
  pageCount?: number | null
  isbns: string[]
  asins: string[]
  format?: "ebook" | "audiobook" | null
}

export const MATCH_SIGNAL_NAMES = [
  "identifier",
  "title",
  "authors",
  "narrators",
  "series",
  "year",
  "extent",
  "format",
] as const
export type MatchSignalName = (typeof MATCH_SIGNAL_NAMES)[number]

export type MatchSignal = {
  name: MatchSignalName
  weight: number
  score: number
  detail?: string
}

export const MATCH_CONFIDENCES = ["certain", "high", "medium", "low"] as const
export type MatchConfidence = (typeof MATCH_CONFIDENCES)[number]

export type MatchScore = {
  score: number
  confidence: MatchConfidence
  signals: MatchSignal[]
}

export type RankedMatch = MatchScore & {
  candidate: MatchCandidate
  margin: number
}

export const HIGH_SCORE = 0.82
export const HIGH_MARGIN = 0.06
export const MEDIUM_SCORE = 0.58

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const TITLE_NOISE =
  /\b(unabridged|abridged|audiobook|audio book|a novel|the audiobook|book \d+|vol(ume)? \d+)\b/g

export function normalizeTitle(value: string): string {
  return normalizeText(value.replace(/[([].*?[)\]]/g, " "))
    .replace(TITLE_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeIdentifier(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase()
}

function bigrams(value: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (let index = 0; index < value.length - 1; index++) {
    const gram = value.slice(index, index + 2)
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }
  return counts
}

export function diceSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0

  const leftGrams = bigrams(left)
  const rightGrams = bigrams(right)

  let shared = 0
  let leftTotal = 0
  for (const [gram, count] of leftGrams) {
    leftTotal += count
    shared += Math.min(count, rightGrams.get(gram) ?? 0)
  }

  let rightTotal = 0
  for (const count of rightGrams.values()) rightTotal += count

  return (2 * shared) / (leftTotal + rightTotal)
}

export function titleSimilarity(left: string, right: string): number {
  const a = normalizeTitle(left)
  const b = normalizeTitle(right)
  if (!a || !b) return 0
  if (a === b) return 1

  const dice = diceSimilarity(a, b)

  const aTokens = new Set(a.split(" "))
  const bTokens = new Set(b.split(" "))
  const smaller = aTokens.size <= bTokens.size ? aTokens : bTokens
  const larger = smaller === aTokens ? bTokens : aTokens
  let contained = 0
  for (const token of smaller) if (larger.has(token)) contained++
  const containment = contained / smaller.size

  const extraTokens = Math.abs(aTokens.size - bTokens.size)
  const lengthPenalty =
    containment === 1 ? Math.min(0.5, extraTokens * 0.18) : 0

  return Math.max(0, Math.max(dice, containment * 0.94) - lengthPenalty)
}

export function nameSimilarity(left: string, right: string): number {
  const a = normalizeText(left)
  const b = normalizeText(right)
  if (!a || !b) return 0
  if (a === b) return 1

  const aParts = a.split(" ")
  const bParts = b.split(" ")
  const aLast = aParts[aParts.length - 1]
  const bLast = bParts[bParts.length - 1]

  if (aLast && bLast && aLast === bLast) {
    const aFirst = aParts[0] ?? ""
    const bFirst = bParts[0] ?? ""
    if (aFirst === bFirst) return 1
    if (aFirst.startsWith(bFirst) || bFirst.startsWith(aFirst)) return 0.92
    return 0.7
  }

  return diceSimilarity(a, b)
}

function bestNameOverlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0
  let best = 0
  for (const a of left) {
    for (const b of right) {
      best = Math.max(best, nameSimilarity(a, b))
      if (best === 1) return 1
    }
  }
  return best
}

function proportionalCloseness(
  actual: number,
  expected: number,
  tolerance: number,
): number {
  if (actual <= 0 || expected <= 0) return 0
  const relative = Math.abs(actual - expected) / expected
  if (relative >= tolerance) return 0
  return 1 - relative / tolerance
}

function identifierScore(
  subject: MatchSubject,
  candidate: MatchCandidate,
): number | null {
  const subjectIsbns = new Set(subject.isbns.map(normalizeIdentifier))
  const subjectAsins = new Set(subject.asins.map(normalizeIdentifier))
  if (!subjectIsbns.size && !subjectAsins.size) return null

  const candidateIsbns = candidate.isbns.map(normalizeIdentifier)
  const candidateAsins = candidate.asins.map(normalizeIdentifier)
  if (!candidateIsbns.length && !candidateAsins.length) return null

  const hit =
    candidateIsbns.some((isbn) => subjectIsbns.has(isbn)) ||
    candidateAsins.some((asin) => subjectAsins.has(asin))

  return hit ? 1 : 0
}

export function scoreMatch(
  subject: MatchSubject,
  candidate: MatchCandidate,
): MatchScore {
  const signals: MatchSignal[] = []

  const identifier = identifierScore(subject, candidate)
  if (identifier !== null) {
    signals.push({
      name: "identifier",
      weight: 6,
      score: identifier,
      detail: identifier ? "exact identifier match" : "identifiers disagree",
    })
  }

  const title = Math.max(
    titleSimilarity(subject.title, candidate.title),
    titleSimilarity(
      [subject.title, subject.subtitle].filter(Boolean).join(" "),
      [candidate.title, candidate.subtitle].filter(Boolean).join(" "),
    ),
  )
  signals.push({ name: "title", weight: 4, score: title })

  if (subject.authors.length && candidate.authors.length) {
    signals.push({
      name: "authors",
      weight: 3,
      score: bestNameOverlap(subject.authors, candidate.authors),
    })
  }

  if (subject.narrators.length && candidate.narrators.length) {
    signals.push({
      name: "narrators",
      weight: 2,
      score: bestNameOverlap(subject.narrators, candidate.narrators),
    })
  }

  if (subject.seriesNames.length && candidate.seriesNames.length) {
    signals.push({
      name: "series",
      weight: 1,
      score: bestNameOverlap(subject.seriesNames, candidate.seriesNames),
    })
  }

  if (subject.publicationYear && candidate.publicationYear) {
    const drift = Math.abs(subject.publicationYear - candidate.publicationYear)
    signals.push({
      name: "year",
      weight: 1,
      score: drift === 0 ? 1 : drift <= 1 ? 0.85 : drift <= 3 ? 0.5 : 0,
      detail: `${subject.publicationYear} vs ${candidate.publicationYear}`,
    })
  }

  if (subject.durationSeconds && candidate.durationSeconds) {
    signals.push({
      name: "extent",
      weight: 2.5,
      score: proportionalCloseness(
        candidate.durationSeconds,
        subject.durationSeconds,
        0.12,
      ),
      detail: "duration",
    })
  } else if (subject.pageCount && candidate.pageCount) {
    signals.push({
      name: "extent",
      weight: 1.5,
      score: proportionalCloseness(candidate.pageCount, subject.pageCount, 0.2),
      detail: "page count",
    })
  }

  if (candidate.format) {
    const wanted =
      candidate.format === "audiobook" ? subject.hasAudiobook : subject.hasEbook
    signals.push({
      name: "format",
      weight: 1,
      score: wanted ? 1 : 0.3,
      detail: candidate.format,
    })
  }

  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0)
  const score = totalWeight
    ? signals.reduce((sum, signal) => sum + signal.weight * signal.score, 0) /
      totalWeight
    : 0

  return { score, confidence: confidenceFor(score, 1, signals), signals }
}

function confidenceFor(
  score: number,
  margin: number,
  signals: MatchSignal[],
): MatchConfidence {
  const identifier = signals.find((signal) => signal.name === "identifier")
  const title = signals.find((signal) => signal.name === "title")

  if (identifier?.score === 1 && (title?.score ?? 1) >= 0.5) return "certain"
  if (score >= HIGH_SCORE && margin >= HIGH_MARGIN) return "high"
  if (score >= MEDIUM_SCORE) return "medium"
  return "low"
}

export function rankMatches(
  subject: MatchSubject,
  candidates: MatchCandidate[],
): RankedMatch[] {
  const scored = candidates
    .map((candidate) => ({ candidate, ...scoreMatch(subject, candidate) }))
    .sort((a, b) => b.score - a.score)

  return scored.map((entry, index) => {
    const margin = index === 0 ? entry.score - (scored[1]?.score ?? 0) : 0
    return {
      ...entry,
      margin,
      confidence: confidenceFor(entry.score, margin, entry.signals),
    }
  })
}

function yearOf(value: string | null | undefined): number | null {
  if (!value) return null
  const year = new Date(value).getUTCFullYear()
  return Number.isNaN(year) ? null : year
}

export function candidateFromSearchResult(
  result: BookMetadataSearchResult,
): MatchCandidate {
  return {
    provider: result.provider,
    id: result.id,
    title: result.title,
    subtitle: result.subtitle ?? null,
    authors: result.authors,
    narrators: result.narrators,
    seriesNames: result.seriesName ? [result.seriesName] : [],
    publicationYear: result.releaseYear ?? yearOf(result.releaseDate),
    isbns: [],
    asins: result.provider === "audnexus" ? [result.id] : [],
    format: result.provider === "audnexus" ? "audiobook" : null,
  }
}

function editionFormat(edition: MetadataEdition): "ebook" | "audiobook" | null {
  const format = edition.format.toLowerCase()
  if (edition.audioSeconds || format.includes("audio")) return "audiobook"
  if (format.includes("physical") || format.includes("hardcover")) return null
  return "ebook"
}

export function candidateFromEdition(
  work: BookMetadataCandidate,
  edition: MetadataEdition,
): MatchCandidate {
  return {
    provider: work.provider,
    id: work.id ?? edition.id,
    editionId: edition.id,
    title: edition.title ?? work.title,
    subtitle: edition.subtitle ?? work.subtitle ?? null,
    authors: work.authors,
    narrators: edition.narrators.length ? edition.narrators : work.narrators,
    seriesNames: work.series.map((series) => series.name),
    publicationYear: yearOf(edition.releaseDate ?? work.releaseDate),
    durationSeconds: edition.audioSeconds ?? null,
    pageCount: edition.pages ?? null,
    isbns: [edition.isbn13, edition.isbn10].filter(
      (value): value is string => !!value,
    ),
    asins: edition.asin ? [edition.asin] : [],
    format: editionFormat(edition),
  }
}

function editionTier(subject: MatchSubject, entry: RankedMatch): number {
  const owned = entry.signals.some(
    (signal) => signal.name === "identifier" && signal.score === 1,
  )
  if (owned) return 0
  if (subject.durationSeconds) return entry.candidate.durationSeconds ? 1 : 2
  if (subject.pageCount) return entry.candidate.pageCount ? 1 : 2
  return 1
}

export function rankEditionMatches(
  subject: MatchSubject,
  candidate: BookMetadataCandidate,
): RankedMatch[] {
  return rankMatches(
    subject,
    (candidate.editions ?? []).map((edition) =>
      candidateFromEdition(candidate, edition),
    ),
  ).sort((a, b) => editionTier(subject, a) - editionTier(subject, b))
}
