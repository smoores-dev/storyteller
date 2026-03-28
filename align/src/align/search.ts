import { max, min, range } from "itertools"

export function buildNgramIndex(text: string) {
  const index = new Map<string, number[]>()

  for (const [ngram, pos] of ngrams(text)) {
    const positions = index.get(ngram)
    if (positions) {
      positions.push(pos)
    } else {
      index.set(ngram, [pos])
    }
  }

  return index
}

export function* ngrams(text: string) {
  const words = text.split("-")

  let pos = 0
  for (const i of range(words.length - 4)) {
    const ngram = words.slice(i, i + 5).join("-")
    yield [ngram, pos] as const
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    pos += words[i]!.length + 1
  }
}

export function collectBoundaryVotes(query: string, document: string) {
  const documentIndex = buildNgramIndex(document)

  let skippedNgrams = 0
  let totalNgrams = 0

  const startVotes: number[] = []
  const endVotes: number[] = []

  for (const [ngram, start] of ngrams(query)) {
    totalNgrams++
    const documentStarts = documentIndex.get(ngram)
    if (!documentStarts) {
      skippedNgrams++
      continue
    }

    for (const documentStart of documentStarts) {
      startVotes.push(documentStart - start)
      endVotes.push(documentStart + (query.length - start))
    }
  }

  if (skippedNgrams > totalNgrams / 2) {
    return null
  }

  return { startVotes, endVotes }
}

const BIN_SIZE = 1000

function binBoundaryVotes(votes: number[]) {
  const start = min(votes)

  const bins = new Map<number, number[]>()
  if (start === undefined) return bins

  for (const vote of votes) {
    const binIndex = Math.floor((vote - start) / BIN_SIZE)
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

  return dir > 0 ? max(best) ?? null : min(best) ?? null
}

export function findBoundaries(query: string, document: string) {
  const boundaryVotes = collectBoundaryVotes(query, document)
  if (!boundaryVotes) return null

  const { startVotes, endVotes } = boundaryVotes

  const startBins = binBoundaryVotes(startVotes)
  const bestStart = chooseBestFromBins(startBins, -1)
  if (bestStart === null) {
    return null
  }

  const endBins = binBoundaryVotes(endVotes)
  const bestEnd = chooseBestFromBins(endBins, 1)
  if (bestEnd === null) {
    return null
  }

  return { start: bestStart, end: bestEnd }
}
