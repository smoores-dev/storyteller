import { enumerate } from "itertools"
import { runes } from "runes2"

export class TextFragmentFactory {
  private runes: string[]
  private spans: string[]
  private spanStarts: number[]
  private charPositions: Map<string, number[]>

  constructor(casedSpans: string[], locale = new Intl.Locale("en-Latn-US")) {
    this.spans = casedSpans.map((span) => span.toLocaleLowerCase(locale))
    this.runes = runes(this.spans.join(""))
    this.spanStarts = []
    let start = 0
    for (const span of this.spans) {
      this.spanStarts.push(start)
      start += span.length
    }

    this.charPositions = new Map()
    for (const [i, char] of enumerate(this.runes)) {
      const positions = this.charPositions.get(char) ?? []
      positions.push(i)
      this.charPositions.set(char, positions)
    }
  }

  findMinimalFragment(spanIndex: number): string {
    const span = this.spans[spanIndex]
    if (!span) throw new RangeError(`Span index ${spanIndex} out of bounds`)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const startPos = this.spanStarts[spanIndex]!

    const chars = runes(span)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstChar = chars[0]!
    const candidates =
      this.charPositions.get(firstChar)?.filter((pos) => pos < startPos) ?? []

    let i = 1
    while (i < chars.length && candidates.length) {
      const toRemove: number[] = []

      const char = chars[i]
      for (let j = 0; j < candidates.length; j++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const candidate = candidates[j]!
        if (this.runes[candidate + i] !== char) {
          toRemove.push(j)
        }
      }
      toRemove.toReversed().map((r) => candidates.splice(r, 1))

      i++
    }

    while (chars.at(i)?.match(/[\p{L}\p{N}]/u) && i < chars.length) i++

    let fragment = ""

    const start = chars.slice(0, i).join("")
    fragment += encodeTextFragmentPart(start)

    const remainingChars = chars.slice(i)
    while (
      !remainingChars.at(-1)?.match(/[\p{L}\p{N}]/u) &&
      remainingChars.length
    ) {
      remainingChars.splice(remainingChars.length - 1, 1)
    }

    let e = remainingChars.length

    let end = ""
    const remainingSpan = remainingChars.join("")

    while (
      remainingSpan.indexOf(end) !==
        remainingSpan.length - remainingChars.slice(e).join("").length &&
      e >= 0
    ) {
      e--
      end = remainingChars.slice(e).join("")
    }

    while (remainingChars.at(e)?.match(/[\p{L}\p{N}]/u) && e >= 0) {
      end = remainingChars.slice(e).join("")
      e--
    }

    // TODO: End might not be sufficient, check for suffix
    if (end) {
      fragment += `,${encodeTextFragmentPart(end)}`
    }

    // We didn't eliminate all candidates, so we start looking at prefixes
    if (candidates.length) {
      let p = 1
      while (p < startPos) {
        const toRemove: number[] = []
        const char = this.runes[startPos - p]
        for (let j = 0; j < candidates.length; j++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const candidate = candidates[j]!
          if (this.runes[candidate - p] !== char) {
            toRemove.push(j)
          }
        }
        toRemove.toReversed().map((r) => candidates.splice(r, 1))

        p++

        if (!candidates.length) break
      }

      while (
        this.runes.at(startPos - p - 1)?.match(/[\p{L}\p{N}]/u) &&
        p <= startPos
      ) {
        p++
      }

      const prefix = this.runes.slice(startPos - p, startPos).join("")

      fragment = `${encodeTextFragmentPart(prefix)}-,${fragment}`
    }

    return `:~:text=${fragment}`
  }
}

function encodeTextFragmentPart(part: string) {
  return encodeURIComponent(part)
    .replaceAll(/-/g, "%2d")
    .replaceAll(/,/g, "%2c")
}
