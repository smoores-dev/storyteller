import { Accuracy, Encoder } from "./encoder"

const langs = {
  en: 32,
}

export function findMatch(
  lang: keyof typeof langs,
  encodingCache: Map<string, string[]>,
  needle: string,
  haystack: string,
) {
  const langId = langs[lang]
  const encoder = new Encoder(Accuracy.APPROX, langId)
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
        encoding = encoder.encode(word)
        encodingCache.set(word, encoding)
      }
      words.push([word, i])
      if (nextSpace === -1) break
      i = nextSpace + 1
    }
  }

  function compareEncodings(n: number, h: number) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [startingNeedle] = needleWords[n]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [startingHaystack] = haystackWords[h]!

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    for (const nEncoding of encodingCache.get(startingNeedle)!) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      for (const hEncoding of encodingCache.get(startingHaystack)!) {
        if (nEncoding === hEncoding) {
          return true
        }

        // Eventually, we'll want to combine encodings to account for
        // split/joined words
        // if (nEncoding.length === hEncoding.length) {
        // return false
        // }

        // if (nEncoding.length)
      }
    }

    return false
  }

  let haystackIndex = -1
  while (haystackIndex < haystackWords.length) {
    haystackIndex = haystackWords.findIndex((_, index) => {
      if (index <= haystackIndex) return false
      return compareEncodings(0, index)
    })
    if (haystackIndex === -1) return null

    let matched = true
    for (let n = 1; n < needleWords.length; n++) {
      if (!compareEncodings(n, haystackIndex + n)) {
        matched = false
        break
      }
    }
    if (matched) {
      return haystackIndex
    }
  }
  return null
}
