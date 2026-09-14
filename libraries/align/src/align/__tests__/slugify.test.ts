import assert from "node:assert"
import { describe, it } from "node:test"

import { segmentChapter } from "../../markup/segmentation.ts"
import { slugify, slugifiedWordRanges } from "../slugify.ts"

void describe("slugify", () => {
  void it("should slugify numbers", async () => {
    const input = "There were 10 cars."
    const output = "there-were-ten-cars"
    const { result } = await slugify(input, new Intl.Locale("en"))
    assert.strictEqual(result, output)
  })

  void it("should slugify numbers with decimals", async () => {
    const input = "It was 74.6 degrees out."
    const output = "it-was-seventy-four-point-six-degrees-out"
    const { result } = await slugify(input, new Intl.Locale("en"))
    assert.strictEqual(result, output)
  })

  void it("should slugify numbers with groupings", async () => {
    const input = "It weighed over 1,000 pounds"
    const output = "it-weighed-over-one-thousand-pounds"
    const { result } = await slugify(input, new Intl.Locale("en"))
    assert.strictEqual(result, output)
  })

  void it("should slugify currency", async () => {
    const input = "It costs $5,500.50."
    const output = "it-costs-five-thousand-five-hundred-dollars-and-fifty-cents"
    const { result } = await slugify(input, new Intl.Locale("en"))
    assert.strictEqual(result, output)
  })

  void it("should slugify German currency", async () => {
    const input = "Es kostet 5.500,50 €"
    const output = "es-kostet-funf-tausend-funf-hundert-euro-und-funfzig-cent"
    const { result } = await slugify(input, new Intl.Locale("de"))
    assert.strictEqual(result, output)
  })

  void it("should slugify Chinese currency", async () => {
    const input = "价格为 ¥5,500.50"
    const output = "jia-ge-wei-wu-qian-wu-bai-yuan-wu-shi-fen"
    const { result } = await slugify(input, new Intl.Locale("zh"))
    assert.strictEqual(result, output)
  })
})

const locale = new Intl.Locale("en")

/**
 * Slugifies `sentence` the way the aligner does, then maps the offsets of
 * every non-punctuation word into ranges of the result.
 */
async function wordRanges(sentence: string) {
  const [segmented] = await segmentChapter(sentence, { primaryLocale: locale })
  assert.ok(segmented)

  const { result: slug, mapping } = await slugify(segmented.text, locale, "")

  const words = segmented.words.entries.filter((w) => !w.isPunctuation)
  const ranges = slugifiedWordRanges(
    segmented.words.entries,
    mapping,
    segmented.charRange.start,
    0,
  )

  return {
    slug,
    words: words.map((word, i) => ({
      text: word.text,
      range: ranges[i]!,
      span: slug.slice(ranges[i]![0], ranges[i]![1] + 1),
    })),
  }
}

void describe("slugifiedWordRanges", () => {
  void it("maps a word ending in dropped punctuation onto its own characters", async () => {
    const { words } = await wordRanges(
      "Mr. Tumnus met Mrs. Beaver at the stop.\n",
    )

    assert.deepStrictEqual(
      words.map(({ text, span }) => [text, span]),
      [
        ["Mr.", "mr"],
        ["Tumnus", "tumnus"],
        ["met", "met"],
        ["Mrs.", "mrs"],
        ["Beaver", "beaver"],
        ["at", "at"],
        ["the", "the"],
        ["stop", "stop"],
      ],
    )
  })

  void it("maps a word whose characters expand to several characters", async () => {
    const { words } = await wordRanges("The 1 was next to the 2\n")

    assert.deepStrictEqual(
      words.map(({ text, span }) => [text, span]),
      [
        ["The", "the"],
        ["1", "one"],
        ["was", "was"],
        ["next", "next"],
        ["to", "to"],
        ["the", "the"],
        ["2", "two"],
      ],
    )
  })

  void it.only("stays inside the slugified text for a final abbreviation", async () => {
    const { slug, words } = await wordRanges(
      "She said Bridget went up and down, and I said, Yes, so did I.\n",
    )

    assert.deepStrictEqual(words.at(-1)!.text, "I.")
    assert.deepStrictEqual(words.at(-1)!.range, [
      slug.length - 1,
      slug.length - 1,
    ])
  })

  void it("stays inside the slugified text for a single word sentence", async () => {
    const { slug, words } = await wordRanges("M.\n")

    assert.deepStrictEqual(
      words.map(({ span }) => span),
      ["m"],
    )
    assert.ok(words[0]!.range[1] < slug.length)
  })

  void it("never maps a word outside its sentence's slugified characters", async () => {
    const sentences = [
      "She said Bridget went up and down, and I said, Yes, so did I.\n",
      "M.\n",
      "Mr. Tumnus met Mrs. Beaver at the 2nd St. stop.\n",
      "U.S. grants were $1,200 in D.C. at 3 p.m.\n",
      "The 1 was next to the 2\n",
      "It cost 74.6 degrees, then 1,000 more.\n",
      "价格为 ¥5,500.50\n",
    ]

    for (const sentence of sentences) {
      const { slug, words } = await wordRanges(sentence)

      for (const {
        text,
        range: [start, end],
      } of words) {
        assert.ok(
          start <= end && start >= 0 && end < slug.length,
          `${JSON.stringify(text)} in ${JSON.stringify(sentence)} mapped to [${start}, ${end}] outside [0, ${slug.length - 1}]`,
        )
      }
    }
  })
})
