import { range } from "itertools"

import { ctcGreedyDecode } from "./greedyDecode.ts"

const NGRAM_SIZE = 10

const RANSAC_ITERATIONS = 500

const MIN_INLIERS = 10

const MAX_PAIR_SEPARATION_REQUIREMENT = 200

const MIN_CONFIDENCE = 0.5

const MIN_COVERAGE = 0.3

const REFINE_COUNT = 25

const ANCHOR_SPACING = 2000

const BOUNDARY_PAD_FRAMES = 500

/**
 * A searchable document. `text` holds the matchable characters, and
 * `positions[i]` is the position of `text[i]` in whatever units the caller
 * wants boundaries expressed in — emission frames for CTC decodings,
 * original character offsets for transcription text, etc.
 */
export type PositionedDocument = {
  text: string
  positions: number[]
}

export interface BoundaryFitOptions {
  minSlope: number
  maxSlope: number
  inlierTolerance: number
}

export type Match = {
  offset: number
  position: number
}

/** Ngram indexes are cached per document object */
const ngramIndexes = new WeakMap<PositionedDocument, Map<string, number[]>>()

/** Greedy decodings are cached per emissions matrix */
const decodedEmissions = new WeakMap<number[][], PositionedDocument>()

function median(values: number[]) {
  const sorted = Array.from(values).sort((a, b) => a - b)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return sorted[Math.floor(sorted.length / 2)]!
}

function getNgramIndex(document: PositionedDocument) {
  const cached = ngramIndexes.get(document)
  if (cached) return cached

  const { text, positions } = document
  const index = new Map<string, number[]>()
  for (const i of range(text.length - NGRAM_SIZE + 1)) {
    const ngram = text.slice(i, i + NGRAM_SIZE)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const position = positions[i]!

    const entries = index.get(ngram)
    if (entries) {
      entries.push(position)
    } else {
      index.set(ngram, [position])
    }
  }

  ngramIndexes.set(document, index)
  return index
}

function collectMatches(query: string, document: PositionedDocument) {
  const index = getNgramIndex(document)

  const queryNgramOffsets = new Map<string, number[]>()
  const matches: Match[] = []
  for (const i of range(query.length - NGRAM_SIZE + 1)) {
    const queryNgram = query.slice(i, i + NGRAM_SIZE)
    const offsets = queryNgramOffsets.get(queryNgram)
    if (offsets) offsets.push(i)
    else queryNgramOffsets.set(queryNgram, [i])

    const positions = index.get(queryNgram)
    if (!positions) continue

    for (const position of positions) {
      matches.push({ offset: i, position })
    }
  }

  return { matches, queryNgramOffsets }
}

function fitLine(
  matches: Match[],
  pairSeparation: number,
  { minSlope, maxSlope, inlierTolerance }: BoundaryFitOptions,
) {
  // Deterministic LCG instead of Math.random so results are reproducible
  let seed = 0x2545f491
  const random = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
    return seed / 0x80000000
  }

  let best: { slope: number; intercept: number; count: number } | null = null

  for (let i = 0; i < RANSAC_ITERATIONS; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const a = matches[Math.floor(random() * matches.length)]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const b = matches[Math.floor(random() * matches.length)]!
    if (Math.abs(b.offset - a.offset) < pairSeparation) continue

    const slope = (b.position - a.position) / (b.offset - a.offset)
    if (slope < minSlope || slope > maxSlope) continue

    const intercept = a.position - slope * a.offset

    let count = 0
    for (const m of matches) {
      const predicted = intercept + slope * m.offset
      if (Math.abs(m.position - predicted) <= inlierTolerance) count++
    }

    if (!best || count > best.count) {
      best = { slope, intercept, count }
    }
  }

  if (!best || best.count < MIN_INLIERS) return null

  const inliers = matches.filter((m) => {
    const predicted = best.intercept + best.slope * m.offset
    return Math.abs(m.position - predicted) <= inlierTolerance
  })

  // Re-estimate the slope from the inliers
  const sorted = inliers.sort((a, b) => a.offset - b.offset)
  const stride = Math.max(Math.floor(sorted.length / 2), 1)
  const slopes: number[] = []
  for (let i = 0; i + stride < sorted.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lo = sorted[i]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const hi = sorted[i + stride]!
    if (hi.offset - lo.offset < pairSeparation) continue
    slopes.push((hi.position - lo.position) / (hi.offset - lo.offset))
  }

  const slope = slopes.length ? median(slopes) : best.slope
  const intercept = sorted.length
    ? median(sorted.map((m) => m.position - slope * m.offset))
    : best.intercept

  return {
    slope,
    intercept,
    inliers,
  }
}

function selectAnchors(
  query: string,
  inliers: Match[],
  queryNgramOffsets: Map<string, number[]>,
  documentNgramIndex: Map<string, number[]>,
  slope: number,
  intercept: number,
  inlierTolerance: number,
) {
  const anchors: Match[] = []
  for (let i = 0; i < query.length; i += ANCHOR_SPACING) {
    const windowStart = Math.max(0, i - ANCHOR_SPACING / 2)
    const windowEnd = Math.min(query.length, i + ANCHOR_SPACING / 2)

    const candidates = inliers
      .filter(({ offset }) => windowStart <= offset && offset < windowEnd)
      .sort(({ offset: a }, { offset: b }) => Math.abs(a - i) - Math.abs(b - i))

    for (const c of candidates) {
      const gram = query.slice(c.offset, c.offset + NGRAM_SIZE)

      // The candidate must be the only document occurrence of its gram
      // that the line deems plausible for this query offset...
      const predicted = intercept + slope * c.offset
      const plausiblePositions = (documentNgramIndex.get(gram) ?? []).filter(
        (position) => Math.abs(position - predicted) <= inlierTolerance,
      )
      if (
        plausiblePositions.length !== 1 ||
        plausiblePositions[0] !== c.position
      ) {
        continue
      }

      // ...and the only query occurrence of its gram that could plausibly
      // explain this document position
      const plausibleOffsets = (queryNgramOffsets.get(gram) ?? []).filter(
        (offset) =>
          Math.abs(c.position - (intercept + slope * offset)) <=
          inlierTolerance,
      )
      if (plausibleOffsets.length !== 1 || plausibleOffsets[0] !== c.offset) {
        continue
      }

      anchors.push(c)
      break
    }
  }

  const monotonicAnchors: Match[] = []
  for (const a of anchors) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      const b = monotonicAnchors.at(-1)
      if (!b || a.position > b.position) {
        monotonicAnchors.push(a)
        break
      }

      const aDist = Math.abs(a.position - (intercept + slope * a.offset))
      const bDist = Math.abs(b.position - (intercept + slope * b.offset))

      if (aDist > bDist) break
      else monotonicAnchors.pop()
    }
  }

  return monotonicAnchors
}

export function findBoundariesInDocument(
  query: string,
  document: PositionedDocument,
  options: BoundaryFitOptions,
) {
  const gramCount = Math.max(query.length - NGRAM_SIZE + 1, 0)
  const pairSeparation = Math.min(
    Math.max(Math.floor(gramCount / 4), 20),
    MAX_PAIR_SEPARATION_REQUIREMENT,
  )

  const { matches, queryNgramOffsets } = collectMatches(query, document)
  if (matches.length < MIN_INLIERS) return null

  const line = fitLine(matches, pairSeparation, options)
  if (!line) return null

  const { slope, intercept, inliers } = line

  const byOffset = inliers.sort((a, b) => a.offset - b.offset)
  const head = byOffset.slice(0, REFINE_COUNT)
  const tail = byOffset.slice(-REFINE_COUNT)

  const extrapolatedStart = Math.min(
    ...head.map((m) => m.position - slope * m.offset),
  )
  const extrapolatedEnd = Math.max(
    ...tail.map((m) => m.position + slope * (query.length - m.offset)),
  )

  const startPad = Math.max(
    BOUNDARY_PAD_FRAMES,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    0.25 * (head[0]!.position - extrapolatedStart),
  )
  const start = extrapolatedStart - startPad

  const endPad = Math.max(
    BOUNDARY_PAD_FRAMES,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    0.25 * (extrapolatedEnd - tail.at(-1)!.position),
  )
  const end = extrapolatedEnd + endPad

  if (end <= start) return null

  const matchedGrams = new Set(matches.map((m) => m.offset)).size
  const inlierGrams = new Set(inliers.map((m) => m.offset)).size
  const confidence = inlierGrams / matchedGrams
  if (confidence < MIN_CONFIDENCE) return null

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const first = byOffset[0]!
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const last = byOffset[byOffset.length - 1]!
  const coverage = (last.offset - first.offset + NGRAM_SIZE) / query.length
  if (coverage < MIN_COVERAGE) return null

  const anchors = selectAnchors(
    query,
    inliers,
    queryNgramOffsets,
    getNgramIndex(document),
    slope,
    intercept,
    options.inlierTolerance,
  )

  return {
    start: Math.round(start),
    end: Math.round(end),
    confidence,
    anchors,
  }
}

export function findCtcBoundaries(
  query: string,
  emissions: number[][],
  vocab: Map<string, number>,
) {
  let document = decodedEmissions.get(emissions)
  if (!document) {
    const blankIndex = vocab.get("<blank>") ?? 0
    const { text, frames } = ctcGreedyDecode(emissions, blankIndex, vocab)
    document = { text, positions: frames }
    decodedEmissions.set(emissions, document)
  }

  const result = findBoundariesInDocument(query, document, {
    minSlope: 1,
    maxSlope: 15,
    inlierTolerance: 2500,
  })
  if (!result) return null

  return {
    ...result,
    start: Math.max(result.start, 0),
    end: Math.min(result.end, emissions.length - 1),
  }
}
