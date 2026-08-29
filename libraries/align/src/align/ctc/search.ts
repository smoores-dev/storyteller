/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { enumerate, range } from "itertools"

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

const EVIDENCE_GAP_MULTIPLIER = 3

const EVIDENCE_GAP_FLOOR = 500

const EVIDENCE_GAP_PERCENTILE = 0.99

const MIN_EDGE_CLUSTER_OFFSETS = 10

const EDGE_EXTENSION_MAX_GAP = 1000

const EDGE_EXTENSION_WINDOW = 250

const EDGE_EXTENSION_PAIR_SEPARATION = 50

const ANCHOR_CONTEXT = 40

const ANCHOR_AGREEMENT_FRACTION = 0.4

const ANCHOR_AGREEMENT_FLOOR = 0.05

const ANCHOR_CALIBRATION_MINIMUM = 5

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
  excludedRanges: [number, number][]
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

function collectMatches(
  query: string,
  document: PositionedDocument,
  excludedRanges: [number, number][],
) {
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
      if (
        excludedRanges.some(
          ([start, end]) => start <= position && position < end,
        )
      ) {
        continue
      }
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

/**
 * Multiset bigram overlap between two strings, normalized by the longer
 * string's bigram count.
 */
function bigramSimilarity(a: string, b: string) {
  if (a.length < 2 || b.length < 2) return 0

  const bigrams = new Map<string, number>()
  for (const i of range(a.length - 1)) {
    const bigram = a.slice(i, i + 2)
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1)
  }

  let shared = 0
  for (const i of range(b.length - 1)) {
    const bigram = b.slice(i, i + 2)
    const remaining = bigrams.get(bigram) ?? 0
    if (remaining > 0) {
      shared++
      bigrams.set(bigram, remaining - 1)
    }
  }

  return shared / Math.max(a.length - 1, b.length - 1)
}

function positionToDocumentIndex(
  document: PositionedDocument,
  position: number,
) {
  const { positions } = document
  let low = 0
  let high = positions.length - 1
  while (low < high) {
    const mid = (low + high) >> 1
    if (positions[mid]! < position) low = mid + 1
    else high = mid
  }
  return low
}

function contextAgreement(
  match: Match,
  query: string,
  document: PositionedDocument,
) {
  const index = positionToDocumentIndex(document, match.position)

  const queryLeft = query.slice(
    Math.max(0, match.offset - ANCHOR_CONTEXT),
    match.offset,
  )
  const documentLeft = document.text.slice(
    Math.max(0, index - ANCHOR_CONTEXT),
    index,
  )

  const queryRight = query.slice(
    match.offset + NGRAM_SIZE,
    match.offset + NGRAM_SIZE + ANCHOR_CONTEXT,
  )
  const documentRight = document.text.slice(
    index + NGRAM_SIZE,
    index + NGRAM_SIZE + ANCHOR_CONTEXT,
  )

  return Math.max(
    bigramSimilarity(queryLeft, documentLeft),
    bigramSimilarity(queryRight, documentRight),
  )
}

function selectAnchors(
  query: string,
  inliers: Match[],
  queryNgramOffsets: Map<string, number[]>,
  document: PositionedDocument,
  slope: number,
  intercept: number,
) {
  const documentNgramIndex = getNgramIndex(document)

  const agreements = new Map<Match, number>()
  const agreement = (match: Match) => {
    let score = agreements.get(match)
    if (score === undefined) {
      score = contextAgreement(match, query, document)
      agreements.set(match, score)
    }
    return score
  }

  const select = (minAgreement: number | null) => {
    const anchors: Match[] = []
    for (let i = 0; i < query.length; i += ANCHOR_SPACING) {
      const windowStart = Math.max(0, i - ANCHOR_SPACING / 2)
      const windowEnd = Math.min(query.length, i + ANCHOR_SPACING / 2)

      const candidates = inliers
        .filter(({ offset }) => windowStart <= offset && offset < windowEnd)
        .sort(
          ({ offset: a }, { offset: b }) => Math.abs(a - i) - Math.abs(b - i),
        )

      for (const c of candidates) {
        const gram = query.slice(c.offset, c.offset + NGRAM_SIZE)

        if (documentNgramIndex.get(gram)?.length !== 1) {
          continue
        }

        if (queryNgramOffsets.get(gram)?.length !== 1) {
          continue
        }

        if (minAgreement !== null && agreement(c) < minAgreement) {
          continue
        }

        anchors.push(c)
        break
      }
    }
    return anchors
  }

  let anchors = select(null)
  if (anchors.length >= ANCHOR_CALIBRATION_MINIMUM) {
    const threshold = Math.max(
      ANCHOR_AGREEMENT_FRACTION * median(anchors.map(agreement)),
      ANCHOR_AGREEMENT_FLOOR,
    )
    anchors = select(threshold)
  }

  const monotonicAnchors: Match[] = []
  for (const a of anchors) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      const b = monotonicAnchors.at(-1)
      if (!b || a.position - b.position >= a.offset - b.offset) {
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

function fitLocalLine(points: Match[], fallbackSlope: number) {
  const stride = Math.max(Math.floor(points.length / 2), 1)
  const slopes: number[] = []
  for (const i of range(0, points.length - stride, stride)) {
    const lo = points[i]!
    const hi = points[i + stride]!
    if (hi.offset - lo.offset < EDGE_EXTENSION_PAIR_SEPARATION) continue
    slopes.push((hi.position - lo.position) / (hi.offset - lo.offset))
  }

  const slope = slopes.length ? median(slopes) : fallbackSlope
  const intercept = median(points.map((m) => m.position - slope * m.offset))
  return { slope, intercept }
}

function extendEdge(
  sortedMatches: Match[],
  sortedInliers: Match[],
  globalSlope: number,
  inlierTolerance: number,
): Match[] {
  const lastInlier = sortedInliers.at(-1)
  if (!lastInlier) return []

  const window = sortedInliers.slice(-EDGE_EXTENSION_WINDOW)
  const accepted: Match[] = []
  let lastAcceptedOffset = lastInlier.offset
  let local = fitLocalLine(window, globalSlope)

  for (const match of sortedMatches) {
    if (match.offset <= lastInlier.offset) continue
    if (match.offset - lastAcceptedOffset > EDGE_EXTENSION_MAX_GAP) break

    const predicted = local.intercept + local.slope * match.offset
    if (Math.abs(match.position - predicted) > inlierTolerance) continue

    accepted.push(match)
    window.push(match)
    if (window.length > EDGE_EXTENSION_WINDOW) window.shift()
    lastAcceptedOffset = match.offset
    local = fitLocalLine(window, globalSlope)
  }

  return accepted
}

function extendInlierEdges(
  matches: Match[],
  sortedInliers: Match[],
  slope: number,
  inlierTolerance: number,
): Match[] {
  const byOffset = matches.toSorted((a, b) => a.offset - b.offset)

  const tail = extendEdge(byOffset, sortedInliers, slope, inlierTolerance)

  function mirror(m: Match): Match {
    return { offset: -m.offset, position: -m.position }
  }

  const head = extendEdge(
    byOffset.map(mirror).reverse(),
    sortedInliers.map(mirror).reverse(),
    slope,
    inlierTolerance,
  )
    .map(mirror)
    .reverse()

  return [...head, ...sortedInliers, ...tail]
}

export function computeEvidenceRange(
  offsets: number[],
  queryLength: number,
): { evidenceRange: [number, number]; matchedRange: [number, number] } {
  if (offsets.length < 2) {
    return { evidenceRange: [0, queryLength], matchedRange: [0, queryLength] }
  }

  const gaps: number[] = []
  for (let i = 1; i < offsets.length; i++) {
    gaps.push(offsets[i]! - offsets[i - 1]!)
  }

  const sortedGaps = gaps.toSorted((a, b) => a - b)

  const p99 =
    sortedGaps[
      Math.min(
        sortedGaps.length - 1,
        Math.floor(sortedGaps.length * EVIDENCE_GAP_PERCENTILE),
      )
    ]!

  const threshold = Math.max(EVIDENCE_GAP_MULTIPLIER * p99, EVIDENCE_GAP_FLOOR)

  const clusters: [number, number][] = []
  let clusterStart = 0
  for (const [i, gap] of enumerate(gaps, 1)) {
    if (gap <= threshold) continue

    clusters.push([clusterStart, i - 1])
    clusterStart = i
  }
  clusters.push([clusterStart, offsets.length - 1])

  let firstCluster = 0
  let lastCluster = clusters.length - 1
  while (
    firstCluster < lastCluster &&
    clusters[firstCluster]![1] - clusters[firstCluster]![0] + 1 <
      MIN_EDGE_CLUSTER_OFFSETS
  ) {
    firstCluster++
  }

  while (
    lastCluster > firstCluster &&
    clusters[lastCluster]![1] - clusters[lastCluster]![0] + 1 <
      MIN_EDGE_CLUSTER_OFFSETS
  ) {
    lastCluster--
  }

  const first = offsets[clusters[firstCluster]![0]]!
  const last = offsets[clusters[lastCluster]![1]]! + NGRAM_SIZE

  return {
    matchedRange: [first, last],
    evidenceRange: [
      first > threshold ? first - threshold : 0,
      queryLength - last > threshold ? last + threshold : queryLength,
    ],
  }
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

  const { matches, queryNgramOffsets } = collectMatches(
    query,
    document,
    options.excludedRanges,
  )
  if (matches.length < MIN_INLIERS) return null

  const line = fitLine(matches, pairSeparation, options)
  if (!line) return null

  const { slope, intercept, inliers } = line

  const byOffset = extendInlierEdges(
    matches,
    inliers.sort((a, b) => a.offset - b.offset),
    slope,
    options.inlierTolerance,
  )
  const inlierOffsets = Array.from(
    new Set(byOffset.map(({ offset }) => offset)),
  )

  const { evidenceRange, matchedRange } = computeEvidenceRange(
    inlierOffsets,
    query.length,
  )

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
  const inlierGrams = inlierOffsets.length
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
    document,
    slope,
    intercept,
  )

  return {
    start: Math.round(start),
    end: Math.round(end),
    confidence,
    anchors,
    evidenceRange,
    matchedRange,
  }
}

export function findCtcBoundaries(
  query: string,
  emissions: number[][],
  vocab: Map<string, number>,
  excludedRanges: [number, number][],
) {
  let document = decodedEmissions.get(emissions)
  if (!document) {
    const blankIndex = vocab.get("<blank>") ?? 0
    const { text, frames } = ctcGreedyDecode(emissions, blankIndex, vocab)
    document = { text, positions: frames }
    decodedEmissions.set(emissions, document)
  }

  const result = findBoundariesInDocument(query, document, {
    excludedRanges,
    minSlope: 2,
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
