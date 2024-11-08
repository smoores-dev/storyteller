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
        encoding = encoder.encode(
          word
            .replaceAll(/[.-_—()[\],/?!@#$%^^&*`~;:="<>+ˌ]/g, "")
            .replaceAll(/’/g, "'"),
        )
        encodingCache.set(word, encoding)
      }
      words.push([word, i])
      if (nextSpace === -1) break
      i = nextSpace + 1
    }
  }

  function compareEncodings(n: number, h: number): [number, number] {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [startingNeedle] = needleWords[n]!
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const [startingHaystack] = haystackWords[h]!

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    for (const nEncoding of encodingCache.get(startingNeedle)!) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      for (const hEncoding of encodingCache.get(startingHaystack)!) {
        if (nEncoding === hEncoding) {
          return [1, 1]
        }

        if (nEncoding.length === hEncoding.length) {
          return [0, 0]
        }

        if (
          nEncoding.length < hEncoding.length &&
          hEncoding.startsWith(nEncoding)
        ) {
          let nMatch = nEncoding
          for (let i = n + 1; i < needleWords.length; i++) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const nextNeedle = needleWords[i]![0]
            let found = false
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const nextEncoding of encodingCache.get(nextNeedle)!) {
              if (nMatch.length + nextEncoding.length > hEncoding.length) {
                continue
              }
              if (!hEncoding.startsWith(nMatch + nextEncoding)) {
                continue
              }
              if (nMatch.length + nextEncoding.length < hEncoding.length) {
                found = true
                nMatch += nextEncoding
                continue
              }
              return [i - n + 1, 1]
            }
            if (!found) return [0, 0]
          }
        }

        if (
          nEncoding.length > hEncoding.length &&
          nEncoding.startsWith(hEncoding)
        ) {
          let hMatch = hEncoding
          for (let i = h + 1; i < haystackWords.length; i++) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const nextHaystack = haystackWords[i]![0]
            let found = false
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            for (const nextEncoding of encodingCache.get(nextHaystack)!) {
              if (hMatch.length + nextEncoding.length > nEncoding.length) {
                continue
              }
              if (!nEncoding.startsWith(hMatch + nextEncoding)) {
                continue
              }
              if (hMatch.length + nextEncoding.length < nEncoding.length) {
                found = true
                hMatch += nextEncoding
                continue
              }
              return [1, i - h + 1]
            }
            if (!found) return [0, 0]
          }
        }
      }
    }

    return [0, 0]
  }

  let haystackIndex = -1
  while (haystackIndex < haystackWords.length) {
    haystackIndex = haystackWords.findIndex((_, index) => {
      if (index <= haystackIndex) return false
      const [n, h] = compareEncodings(0, index)
      return n && h
    })
    if (haystackIndex === -1) return null

    let matched = true
    let h = 1
    for (let n = 1; n < needleWords.length; ) {
      if (haystackIndex + h >= haystackWords.length) {
        return null
      }
      const [bumpN, bumpH] = compareEncodings(n, haystackIndex + h)
      if (!bumpN && !bumpH) {
        matched = false
        break
      }
      n += bumpN
      h += bumpH
    }
    if (matched) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const [, firstHaystackWordStart] = haystackWords[haystackIndex]!
      const [lastHaystackWord, lastHaystackWordStart] =
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        haystackWords[haystackIndex + h - 1]!

      const match = haystack.slice(
        firstHaystackWordStart,
        lastHaystackWordStart + lastHaystackWord.length,
      )
      return { match, index: firstHaystackWordStart }
    }
  }
  return null
}
