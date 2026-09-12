import { enumerate, max, min, range } from "itertools"

import { Mapping } from "@storyteller-platform/mapping"

export function buildNgramIndex(
  text: string,
  ngramSize: number,
  gramDelimiter: string,
) {
  const index = new Map<string, number[]>()

  for (const [ngram, pos] of ngrams(text, ngramSize, gramDelimiter)) {
    const positions = index.get(ngram)
    if (positions) {
      positions.push(pos)
    } else {
      index.set(ngram, [pos])
    }
  }

  return index
}

export function* ngrams(
  text: string,
  ngramSize: number,
  gramDelimiter: string,
) {
  const grams = text.split(gramDelimiter)

  for (const i of range(grams.length - ngramSize + 1)) {
    const ngram = grams.slice(i, i + ngramSize).join(gramDelimiter)
    yield [ngram, i] as const
  }
}

export function collectBoundaryVotes(
  query: string,
  document: string,
  ngramSize: number,
  gramDelimiter: string,
) {
  const queryGrams = query.split(gramDelimiter)
  const documentIndex = buildNgramIndex(document, ngramSize, gramDelimiter)

  let skippedNgrams = 0
  let totalNgrams = 0

  const startVotes: number[] = []
  const endVotes: number[] = []

  for (const [ngram, start] of ngrams(query, ngramSize, gramDelimiter)) {
    totalNgrams++
    const documentStarts = documentIndex.get(ngram)
    if (!documentStarts) {
      skippedNgrams++
      continue
    }

    for (const documentStart of documentStarts) {
      startVotes.push(documentStart - start)
      endVotes.push(documentStart + (queryGrams.length - start))
    }
  }

  if (skippedNgrams > totalNgrams / 2) {
    return null
  }

  return { startVotes, endVotes }
}

function binBoundaryVotes(votes: number[], binSize: number) {
  const start = min(votes)

  const bins = new Map<number, number[]>()
  if (start === undefined) return bins

  for (const vote of votes) {
    const binIndex = Math.floor((vote - start) / binSize)
    const bin = bins.get(binIndex)
    if (bin) {
      bin.push(vote)
    } else {
      bins.set(binIndex, [vote])
    }
  }

  return bins
}

function chooseBestFromBins(bins: Map<number, number[]>, dir: 1 | -1) {
  const totalLength = Array.from(bins.values()).reduce(
    (acc, bin) => acc + bin.length,
    0,
  )
  const best = max(bins.values(), (bin) => bin.length)
  if (!best) return null

  if (best.length / totalLength < 0.2) {
    return null
  }

  return dir > 0 ? (max(best) ?? null) : (min(best) ?? null)
}

function getOffsetFromWordIndex(
  wordIndex: number,
  document: string,
  gramDelimiter: string,
) {
  const words = document.split(gramDelimiter)

  let offset = 0
  for (const i of range(Math.min(words.length, Math.max(0, wordIndex)))) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    offset += words[i]!.length + 1
  }

  return offset
}

function findBoundariesInternal(
  query: string,
  document: string,
  ngramSize: number,
  binSize: number,
  gramDelimiter: string,
) {
  const boundaryVotes = collectBoundaryVotes(
    query,
    document,
    ngramSize,
    gramDelimiter,
  )
  if (!boundaryVotes) return null

  const { startVotes, endVotes } = boundaryVotes

  const startBins = binBoundaryVotes(startVotes, binSize)
  const bestStart = chooseBestFromBins(startBins, -1)
  if (bestStart === null) {
    return null
  }

  const endBins = binBoundaryVotes(endVotes, binSize)
  const bestEnd = chooseBestFromBins(endBins, 1)
  if (bestEnd === null) {
    return null
  }

  return { bestStart, bestEnd }
}

export function findBoundaries(query: string, document: string) {
  const ngramSize = 5
  const binSize = 1000
  const gramDelimiter = "-"

  const result = findBoundariesInternal(
    query,
    document,
    ngramSize,
    binSize,
    gramDelimiter,
  )
  if (!result) return null

  const { bestStart, bestEnd } = result

  return {
    start: getOffsetFromWordIndex(bestStart, document, gramDelimiter),
    end: getOffsetFromWordIndex(bestEnd, document, gramDelimiter),
  }
}

function smooshWords(input: string) {
  const mapping = new Mapping()
  let smooshed = ""
  for (const [i, c] of enumerate(input)) {
    if (c !== "-") {
      smooshed += c
      continue
    }

    mapping.insertMap(i, 1, 0)
  }

  return { smooshed, mapping }
}

export function findCtcBoundaries(query: string, document: string) {
  const ngramSize = 10
  const binSize = 5000
  const gramDelimiter = ""

  const { smooshed: smooshedQuery } = smooshWords(query)
  const { smooshed: smooshedDocument, mapping: documentMapping } =
    smooshWords(document)

  const result = findBoundariesInternal(
    smooshedQuery,
    smooshedDocument,
    ngramSize,
    binSize,
    gramDelimiter,
  )
  if (!result) return null

  const { bestStart, bestEnd } = result

  return {
    start: documentMapping.cursor().map(Math.max(bestStart, 0), "start"),
    end: documentMapping
      .cursor()
      .map(Math.min(bestEnd, document.length - 1), "end"),
  }
}
