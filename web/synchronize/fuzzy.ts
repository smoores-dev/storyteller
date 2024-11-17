import { Accuracy, Encoder } from "bmpm"

const langs = {
  ar: "arabic",
  ru: "cyrillic",
  cs: "czech",
  nl: "dutch",
  en: "english",
  fr: "french",
  de: "german",
  el: "greek",
  he: "hebrew",
  hu: "hungarian",
  it: "italian",
  lv: "latvian",
  pl: "polish",
  pt: "portuguese",
  ro: "romanian",
  es: "spanish",
  tr: "turkish",
} as const

const BMPM_SUPPORTED_LANGS = Object.keys(langs)

export function isBmpmLanguage(
  language: string,
): language is keyof typeof langs {
  return BMPM_SUPPORTED_LANGS.includes(language)
}

export function findNearestPhoneticMatch(
  lang: keyof typeof langs,
  encodingCache: Map<string, string>,
  needle: string,
  haystack: string,
) {
  const langId = langs[lang]
  const encoder = new Encoder(Accuracy.EXACT, langId)
  const needleWords: [string, number][] = []
  const haystackWords: [string, number][] = []
  for (const [span, words] of [
    [needle, needleWords],
    [haystack, haystackWords],
  ] as const) {
    for (let i = 0; i < span.length; ) {
      const nextSpace = span.indexOf(" ", i)
      const word = span.slice(i, nextSpace === -1 ? undefined : nextSpace)
      let encoding = encodingCache.get(word)
      if (!encoding) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        encoding = encoder.encode(
          word
            .replaceAll(/[-._()[\],/?!@#$%^^&*`~;:="“”<>+ˌ]/g, "")
            .replaceAll(/’/g, "'"),
        )[0]!
        encodingCache.set(word, encoding)
      }
      words.push([word, i])
      if (nextSpace === -1) break
      i = nextSpace + 1
    }
  }

  const encodedNeedle = needleWords
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .map(([n]) => encodingCache.get(n)!)
    .join("")
  const encodedHaystack = haystackWords
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .map(([h]) => encodingCache.get(h)!)
    .join("")

  const match = findNearestMatch(
    encodedNeedle,
    encodedHaystack,
    Math.max(Math.round(0.25 * encodedNeedle.length), 1),
  )
  if (!match) return null

  const start = match.index
  const end = match.index + match.match.length

  const startMapped = haystackWords.reduce(
    (p, [h, i]) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      i >= p ? p : p + (h.length - encodingCache.get(h)!.length + 1),
    start,
  )
  const endMapped = haystackWords.reduce(
    (p, [h, i]) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      i >= p ? p : p + (h.length - encodingCache.get(h)!.length + 1),
    end,
  )

  return {
    index: startMapped,
    match: haystack.slice(startMapped, endMapped),
  }
}

export function findNearestMatch(
  needle: string,
  haystack: string,
  maxDist: number,
) {
  let nearest: {
    start: number
    end: number
    dist: number
  } | null = null

  for (const match of levenshteinNgram(needle, haystack, maxDist)) {
    if (!nearest || match.dist < nearest.dist) {
      nearest = match
    }
  }

  return (
    nearest && {
      match: haystack.slice(nearest.start, nearest.end),
      index: nearest.start,
    }
  )
}

function reverse(str: string, from = str.length, to = 0) {
  let reversed = ""
  for (let i = from - 1; i >= to; i--) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    reversed = reversed + str[i]!
  }
  return reversed
}

function* searchExact(
  subsequence: string,
  sequence: string,
  startIndex = 0,
  endIndex = sequence.length,
) {
  let index = sequence.indexOf(subsequence, startIndex)
  while (index !== -1 && index + subsequence.length < endIndex) {
    yield index
    index = sequence.indexOf(subsequence, index + 1)
  }
}

function expand(subsequence: string, sequence: string, maxDist: number) {
  const subsequenceLength = subsequence.length
  if (subsequenceLength === 0) {
    return { index: 0, score: 0 }
  }

  const scores = Array.from({ length: subsequenceLength + 1 }).map((_, i) => i)

  let minScore = subsequenceLength
  let minScoreIndex = -1
  let maxGoodScore = maxDist
  let newNeedleIndexRangeStart: number | null = 0
  let newNeedleIndexRangeEnd = subsequenceLength - 1

  for (
    let sequenceIndex = 0;
    sequenceIndex < sequence.length;
    sequenceIndex++
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const char = sequence[sequenceIndex]!
    // Calculate scores, one for each character in the sub sequence
    const needleIndexRangeStart = newNeedleIndexRangeStart
    const needleIndexRangeEnd = Math.min(
      subsequenceLength,
      newNeedleIndexRangeEnd + 1,
    )

    let a = sequenceIndex
    let c = a + 1

    if (c <= maxGoodScore) {
      newNeedleIndexRangeStart = 0
      newNeedleIndexRangeEnd = 0
    } else {
      newNeedleIndexRangeStart = null
      newNeedleIndexRangeEnd = -1
    }

    for (
      let subsequenceIndex = needleIndexRangeStart;
      subsequenceIndex < needleIndexRangeEnd;
      subsequenceIndex++
    ) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const b = scores[subsequenceIndex]!
      c = scores[subsequenceIndex] = Math.min(
        a + (char === subsequence[subsequenceIndex] ? 0 : 1),
        b + 1,
        c + 1,
      )
      a = b

      if (c <= maxGoodScore) {
        if (newNeedleIndexRangeStart === null) {
          newNeedleIndexRangeStart = subsequenceIndex
        }
        newNeedleIndexRangeEnd = Math.max(
          newNeedleIndexRangeEnd,
          subsequenceIndex + 1 + (maxGoodScore - c),
        )
      }
    }

    // Bail early when it is impossible to find a better expansion
    if (newNeedleIndexRangeStart === null) {
      break
    }

    // Keep the minimum score found for matches of the entire subsequence
    if (needleIndexRangeEnd === subsequenceLength && c <= minScore) {
      minScore = c
      minScoreIndex = sequenceIndex
      if (minScore < maxGoodScore) {
        maxGoodScore = minScore
      }
    }
  }
  return minScore <= maxDist
    ? { score: minScore, index: minScoreIndex + 1 }
    : null
}

function* levenshteinNgram(
  subsequence: string,
  sequence: string,
  maxDist: number,
) {
  const subsequenceLength = subsequence.length
  const sequenceLength = sequence.length

  const ngramLength = Math.round(subsequenceLength / (maxDist + 1))
  if (ngramLength === 0) {
    throw new Error("The subsequence length must be greater than maxDist")
  }

  for (
    let ngramStart = 0;
    ngramStart < subsequenceLength - ngramLength + 1;
    ngramStart += ngramLength
  ) {
    const ngramEnd = ngramStart + ngramLength
    const subsequenceBeforeReversed = reverse(subsequence, ngramStart)
    const subsequenceAfter = subsequence.slice(ngramEnd)

    const startIndex = Math.max(0, ngramStart - maxDist)
    const endIndex = Math.min(
      sequenceLength,
      sequenceLength - subsequenceLength + ngramEnd + maxDist,
    )
    for (const index of searchExact(
      subsequence.slice(ngramStart, ngramEnd),
      sequence,
      startIndex,
      endIndex,
    )) {
      // try to expand left and/or right according to n-gram
      const rightMatch = expand(
        subsequenceAfter,
        sequence.slice(
          index + ngramLength,
          index - ngramStart + subsequenceLength + maxDist,
        ),
        maxDist,
      )

      if (rightMatch === null) continue

      const { score: distRight, index: rightExpandSize } = rightMatch

      const leftMatch = expand(
        subsequenceBeforeReversed,
        reverse(
          sequence,
          index,
          Math.max(0, index - ngramStart - (maxDist - distRight)),
        ),
        maxDist - distRight,
      )

      if (leftMatch === null) continue

      const { score: distLeft, index: leftExpandSize } = leftMatch

      const start = index - leftExpandSize
      yield {
        start,
        end: index + ngramLength + rightExpandSize,
        // dist: distLeft + distRight + (start / sequenceLength) * maxDist,
        dist: distLeft + distRight,
      }
    }
  }
}
