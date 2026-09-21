import { describe, expect, it } from "vitest"

import {
  type EmissionTokenizer,
  encodeUnigram,
  unigramText,
} from "@storyteller-platform/ghost-story"
import {
  slugify as libSlugify,
  transliterate,
} from "@storyteller-platform/transliteration"

import { segmentChapter } from "../../markup/segmentation.ts"
import { ctcViterbiAlign } from "../ctc/forcedAlign.ts"
import { slugify, slugifiedWordRanges, createReplacers } from "../slugify.ts"

const VOCABS = {
  en: "▁ a b c d e f g h i j k l m n o p q r s t u v w x y z ' <blk>",
  fr: "▁ a b c d e f g h i j k l m n o p q r s t u v w x y z ' ç é â ê î ô û à è ù ë ï ü ÿ <blk>",
  ru: "▁ а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я <blk>",
}

const SAMPLES = {
  en: "Hello there, it's a fine day! 42 cats.",
  fr: "Ça a été très difficile, l'hôtel était 42 fermé.",
  ru: "Съешь же ещё этих мягких французских 42 слова булок.",
}

function readVocab(spaced: string) {
  const vocab = new Map<string, number>()
  for (const [index, token] of spaced.split(" ").entries()) {
    if (token === "<blk>") vocab.set("<blank>", index)
    else if (token === "▁") vocab.set("|", index)
    else vocab.set(token, index)
  }
  return vocab
}

function table(rows: string[][]) {
  const widths = rows[0]!.map((_, c) =>
    Math.max(...rows.map((r) => (r[c] ?? "").length)),
  )
  return rows
    .map((r) =>
      r
        .map((cell, c) => cell.padEnd(widths[c]!))
        .join("  ")
        .trimEnd(),
    )
    .join("\n")
}

async function segment(text: string, locale: Intl.Locale) {
  return segmentChapter(text, { primaryLocale: locale })
}

function labelsFor(slug: string, vocab: Map<string, number>) {
  const star = vocab.size
  return slug.split("").map((c) => vocab.get(c) ?? star)
}

function renderLabels(slug: string, vocab: Map<string, number>) {
  const star = vocab.size
  const labels = labelsFor(slug, vocab)
  const stars = labels.filter((l) => l === star).length
  const maxWidth = Math.max(...labels.map((l) => String(l).length))
  return [
    `chars   ${slug
      .split("")
      .map((c) => c.padStart(maxWidth))
      .join(" ")}`,
    ` labels  ${labels.map((l) => (l === star ? "*".padStart(maxWidth) : String(l).padStart(maxWidth))).join(" ")}`,
    ` stars    ${stars} of ${labels.length}`,
  ].join("\n")
}

describe("step 1: segmentation gives sentences made of words with offsets", () => {
  it("english, note the exclamation mark ends a sentence", async () => {
    const sentences = await segment(SAMPLES.en, new Intl.Locale("en"))
    expect(
      sentences
        .map(
          (s) =>
            `${s.charRange.start}..${s.charRange.end} ${JSON.stringify(s.text)}`,
        )
        .join("\n"),
    ).toMatchInlineSnapshot(`
      "0..30 "Hello there, it's a fine day! "
      30..38 "42 cats.""
    `)
    expect(
      table([
        ["sentence", "word", "start", "end", "punct"],
        ...sentences.flatMap((s, i) =>
          s.words.entries.map((w) => [
            String(i),
            JSON.stringify(w.text),
            String(w.startOffset),
            String(w.endOffset),
            w.isPunctuation ? "yes" : "",
          ]),
        ),
      ]),
    ).toMatchInlineSnapshot(`
      "sentence  word     start  end  punct
      0         "Hello"  0      5
      0         " "      5      6    yes
      0         "there"  6      11
      0         ","      11     12   yes
      0         " "      12     13   yes
      0         "it's"   13     17
      0         " "      17     18   yes
      0         "a"      18     19
      0         " "      19     20   yes
      0         "fine"   20     24
      0         " "      24     25   yes
      0         "day"    25     28
      0         "!"      28     29   yes
      0         " "      29     30   yes
      1         "42"     30     32
      1         " "      32     33   yes
      1         "cats"   33     37
      1         "."      37     38   yes"
    `)
  })
})

describe("step 2: transliteration alone, before any slug rules", () => {
  it("keeps case, spaces and punctuation, only swaps scripts and accents", async () => {
    const out: string[] = []
    for (const [lang, text] of Object.entries(SAMPLES)) {
      const { result } = await transliterate(text, {
        locale: new Intl.Locale(lang),
      })
      out.push(`${lang}  ${text}\n    ${result}`)
    }
    expect(out.join("\n")).toMatchInlineSnapshot(`
      "en  Hello there, it's a fine day! 42 cats.
          Hello there, it's a fine day! 42 cats.
      fr  Ça a été très difficile, l'hôtel était 42 fermé.
          Ca a ete tres difficile, l'hotel etait 42 ferme.
      ru  Съешь же ещё этих мягких французских 42 слова булок.
          Sesh zhe eshchyo etih myagkih francuzskih 42 slova bulok."
    `)
  })
})

describe("step 3: slugify = number words + transliterate + lowercase + allowedChars filter", () => {
  it("with the default dash separator, for reading", async () => {
    const out: string[] = []
    for (const [lang, text] of Object.entries(SAMPLES)) {
      const { result } = await slugify(text, new Intl.Locale(lang))
      out.push(`${lang}  ${result}`)
    }
    expect(out.join("\n")).toMatchInlineSnapshot(`
      "en  hello-there-it-s-a-fine-day-forty-two-cats
      fr  ca-a-ete-tres-difficile-l-hotel-etait-quarante-deux-ferme
      ru  sesh-zhe-eshchyo-etih-myagkih-francuzskih-sorok-dva-slova-bulok"
    `)
  })

  it("with the empty separator, which is what the aligner feeds the viterbi", async () => {
    const out: string[] = []
    for (const [lang, text] of Object.entries(SAMPLES)) {
      const { result } = await slugify(text, new Intl.Locale(lang), "")
      out.push(`${lang}  ${result}`)
    }
    expect(out.join("\n")).toMatchInlineSnapshot(`
      "en  hellothereitsafinedayfortytwocats
      fr  caaetetresdifficilelhoteletaitquarantedeuxferme
      ru  seshzheeshchyoetihmyagkihfrancuzskihsorokdvaslovabulok"
    `)
  })
})

describe("step 4: the mapping records how every original position moved", () => {
  it("position by position, english", async () => {
    const text = "Ça, 42 cats!"
    const { result, mapping } = await slugify(text, new Intl.Locale("en"), "")
    const cursor = mapping.cursor()
    const rows = [["pos", "char", "→ start", "→ end", "slug slice"]]
    for (let i = 0; i < text.length; i++) {
      const start = cursor.map(i)
      const end = cursor.map(i + 1, "end")
      rows.push([
        String(i),
        JSON.stringify(text[i]),
        String(start),
        String(end),
        JSON.stringify(result.slice(start, end)),
      ])
    }
    expect(`slug: ${JSON.stringify(result)}\n${table(rows)}`)
      .toMatchInlineSnapshot(`
      "slug: "cafortytwocats"
      pos  char  → start  → end  slug slice
      0    "Ç"   0        1      "c"
      1    "a"   1        2      "a"
      2    ","   2        2      ""
      3    " "   2        2      ""
      4    "4"   2        9      "fortytw"
      5    "2"   9        10     "o"
      6    " "   10       10     ""
      7    "c"   10       11     "c"
      8    "a"   11       12     "a"
      9    "t"   12       13     "t"
      10   "s"   13       14     "s"
      11   "!"   14       14     """
    `)
  })

  it("word by word across sentences, which is what slugifiedWordRanges does", async () => {
    const locale = new Intl.Locale("en")
    const sentences = await segment(SAMPLES.en, locale)
    const rows = [["sentence", "word", "chapter range", "slug span"]]
    let chapterSlug = ""
    for (const [i, sentence] of sentences.entries()) {
      const { result, mapping } = await slugify(sentence.text, locale, "")
      const ranges = slugifiedWordRanges(
        sentence.words.entries,
        mapping,
        sentence.charRange.start,
        chapterSlug.length,
      )
      chapterSlug += result
      const words = sentence.words.entries.filter((w) => !w.isPunctuation)
      for (const [j, w] of words.entries()) {
        const [start, end] = ranges[j]!
        rows.push([
          String(i),
          JSON.stringify(w.text),
          `[${start}, ${end}]`,
          JSON.stringify(chapterSlug.slice(start, end + 1)),
        ])
      }
    }
    expect(`chapter slug: ${JSON.stringify(chapterSlug)}\n${table(rows)}`)
      .toMatchInlineSnapshot(`
      "chapter slug: "hellothereitsafinedayfortytwocats"
      sentence  word     chapter range  slug span
      0         "Hello"  [0, 4]         "hello"
      0         "there"  [5, 9]         "there"
      0         "it's"   [10, 12]       "its"
      0         "a"      [13, 13]       "a"
      0         "fine"   [14, 17]       "fine"
      0         "day"    [18, 20]       "day"
      1         "42"     [21, 28]       "fortytwo"
      1         "cats"   [29, 32]       "cats""
    `)
  })
})

describe("step 5: each slug character becomes a vocab id, or a star when missing", () => {
  it("english text against the english vocab", async () => {
    const { result } = await slugify(SAMPLES.en, new Intl.Locale("en"), "")
    expect(renderLabels(result, readVocab(VOCABS.en))).toMatchInlineSnapshot(`
      "chars    h  e  l  l  o  t  h  e  r  e  i  t  s  a  f  i  n  e  d  a  y  f  o  r  t  y  t  w  o  c  a  t  s
       labels   8  5 12 12 15 20  8  5 18  5  9 20 19  1  6  9 14  5  4  1 25  6 15 18 20 25 20 23 15  3  1 20 19
       stars    0 of 33"
    `)
  })

  it("french text against the french vocab loses its accents but never stars", async () => {
    const { result } = await slugify(SAMPLES.fr, new Intl.Locale("fr"), "")
    expect(renderLabels(result, readVocab(VOCABS.fr))).toMatchInlineSnapshot(`
      "chars    c  a  a  e  t  e  t  r  e  s  d  i  f  f  i  c  i  l  e  l  h  o  t  e  l  e  t  a  i  t  q  u  a  r  a  n  t  e  d  e  u  x  f  e  r  m  e
       labels   3  1  1  5 20  5 20 18  5 19  4  9  6  6  9  3  9 12  5 12  8 15 20  5 12  5 20  1  9 20 17 21  1 18  1 14 20  5  4  5 21 24  6  5 18 13  5
       stars    0 of 47"
    `)
  })

  it("russian text against the russian vocab is all stars", async () => {
    const { result } = await slugify(SAMPLES.ru, new Intl.Locale("ru"), "")
    expect(renderLabels(result, readVocab(VOCABS.ru))).toMatchInlineSnapshot(`
      "chars    s  e  s  h  z  h  e  e  s  h  c  h  y  o  e  t  i  h  m  y  a  g  k  i  h  f  r  a  n  c  u  z  s  k  i  h  s  o  r  o  k  d  v  a  s  l  o  v  a  b  u  l  o  k
       labels   *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *
       stars    54 of 54"
    `)
  })
})

const replacerMap = new WeakMap<Intl.Locale, Record<string, string>>()

describe("step 6: experiment, normalize toward the vocab instead of toward latin", () => {
  function vocabChars(vocab: Map<string, number>) {
    return [...vocab.keys()].filter((k) => k.length === 1 && k !== "|")
  }

  async function normalizeToVocab(
    text: string,
    locale: Intl.Locale,
    vocab: Map<string, number>,
    lowercaseFirst: boolean,
  ) {
    const source = lowercaseFirst ? text.toLocaleLowerCase(locale) : text

    const { result, mapping } = await transliterate(source, {
      locale,
      ignore: vocabChars(vocab),
      replace: replacerMap.get(locale) ?? createReplacers(locale),
    })

    const res = lowercaseFirst ? result.toLocaleLowerCase(locale) : result

    const kept = res
      .toLocaleLowerCase(locale)
      .split("")
      .filter((c) => vocab.has(c))
      .join("")
    return { result: res, kept, mapping }
  }

  it("trap: the ignore list is lowercase, so capitals get transliterated before lowercasing", async () => {
    const fr = await normalizeToVocab(
      SAMPLES.fr,
      new Intl.Locale("fr"),
      readVocab(VOCABS.fr),
      false,
    )
    const ru = await normalizeToVocab(
      SAMPLES.ru,
      new Intl.Locale("ru"),
      readVocab(VOCABS.ru),
      false,
    )
    expect(
      [
        `fr  ${fr.result}`,
        `    ${fr.kept}`,
        `ru  ${ru.result}`,
        `    ${ru.kept}`,
      ].join("\n"),
    ).toMatchInlineSnapshot(`
      "fr  Ca a été très difficile, l'hôtel était Quarante-Deux fermé.
          caaététrèsdifficilel'hôtelétaitquarantedeuxfermé
      ru  Sъешь же ещё этих мягких французских Sорок Dва слова булок.
          ъешьжеещёэтихмягкихфранцузскихороквасловабулок"
    `)
  })

  it("french keeps its accents and apostrophe once lowercased first", async () => {
    const vocab = readVocab(VOCABS.fr)
    const { result, kept } = await normalizeToVocab(
      SAMPLES.fr,
      new Intl.Locale("fr"),
      vocab,
      true,
    )
    expect(
      [`transliterate+ignore  ${result}`, `kept vocab chars      ${kept}`].join(
        "\n",
      ),
    ).toMatchInlineSnapshot(`
      "transliterate+ignore  ça a été très difficile, l'hôtel était quarante-deux fermé.
      kept vocab chars      çaaététrèsdifficilel'hôtelétaitquarantedeuxfermé"
    `)
    expect(renderLabels(kept, vocab)).toMatchInlineSnapshot(`
      "chars    ç  a  a  é  t  é  t  r  è  s  d  i  f  f  i  c  i  l  e  l  '  h  ô  t  e  l  é  t  a  i  t  q  u  a  r  a  n  t  e  d  e  u  x  f  e  r  m  é
       labels  28  1  1 29 20 29 20 18 36 19  4  9  6  6  9  3  9 12  5 12 27  8 33 20  5 12 29 20  1  9 20 17 21  1 18  1 14 20  5  4  5 21 24  6  5 18 13 29
       stars    0 of 48"
    `)
  })

  it("russian survives untouched the same way", async () => {
    const vocab = readVocab(VOCABS.ru)
    const { result, kept, mapping } = await normalizeToVocab(
      SAMPLES.ru,
      new Intl.Locale("ru"),
      vocab,
      true,
    )
    expect(
      [`transliterate+ignore  ${result}`, `kept vocab chars      ${kept}`].join(
        "\n",
      ),
    ).toMatchInlineSnapshot(`
      "transliterate+ignore  съешь же ещё этих мягких французских sорок dва слова булок.
      kept vocab chars      съешьжеещёэтихмягкихфранцузскихороквасловабулок"
    `)
    expect(renderLabels(kept, vocab)).toMatchInlineSnapshot(`
      "chars    с  ъ  е  ш  ь  ж  е  е  щ  ё  э  т  и  х  м  я  г  к  и  х  ф  р  а  н  ц  у  з  с  к  и  х  о  р  о  к  в  а  с  л  о  в  а  б  у  л  о  к
       labels  19 28  6 26 30  8  6  6 27  7 31 20 10 23 14 33  4 12 10 23 22 18  1 15 24 21  9 19 12 10 23 16 18 16 12  3  1 19 13 16  3  1  2 21 13 16 12
       stars    0 of 47"
    `)
    const cursor = mapping.cursor()
    expect(
      [0, 5, 6, 8, 9]
        .map((i) => `${i} ${JSON.stringify(SAMPLES.ru[i])} → ${cursor.map(i)}`)
        .join("\n"),
    ).toMatchInlineSnapshot(`
      "0 "С" → 0
      5 " " → 5
      6 "ж" → 6
      8 " " → 8
      9 "е" → 9"
    `)
  })

  it("english still transliterates non-vocab letters it meets, like a stray é", async () => {
    const vocab = readVocab(VOCABS.en)
    const { result, kept } = await normalizeToVocab(
      "The café's 3 chairs.",
      new Intl.Locale("en"),
      vocab,
      true,
    )
    expect(
      [`transliterate+ignore  ${result}`, `kept vocab chars      ${kept}`].join(
        "\n",
      ),
    ).toMatchInlineSnapshot(`
      "transliterate+ignore  the cafe's three chairs.
      kept vocab chars      thecafe'sthreechairs"
    `)
  })
})

describe("step 7: citrinet, text must be cut into the pieces the model emits", () => {
  const pieces = [
    "<unk>",
    "▁the",
    "▁cat",
    "s",
    "▁",
    "t",
    "h",
    "e",
    "c",
    "a",
    "▁ca",
    "ts",
    "<blank>",
  ]
  const scores = [
    0, -3.2, -4.1, -2.0, -1.5, -5.0, -5.5, -4.8, -6.0, -5.2, -7.0, -6.5, 0,
  ]
  const vocab = new Map(pieces.map((p, i) => [p, i]))
  const tokenizer: EmissionTokenizer = {
    kind: "unigram",
    scores: Float32Array.from(scores),
    unkId: 0,
  }

  it("marks word starts with ▁ then runs a viterbi over the text", () => {
    const text = unigramText(["the", "cats"])
    const { ids, offsets } = encodeUnigram(vocab, tokenizer, text)
    const rows = [["piece", "id", "offset", "score"]]
    for (const [i, id] of ids.entries()) {
      rows.push([
        JSON.stringify(pieces[id]),
        String(id),
        String(offsets[i]),
        String(scores[id]),
      ])
    }
    expect(
      `text: ${JSON.stringify(text)}\n${table(rows)}\nend offset: ${offsets[ids.length]}`,
    ).toMatchInlineSnapshot(`
      "text: "▁the▁cats"
      piece   id  offset  score
      "▁the"  1   0       -3.2
      "▁cat"  2   4       -4.1
      "s"     3   8       -2
      end offset: 9"
    `)
  })

  it("falls back to unk for a character no piece covers", () => {
    const text = unigramText(["the", "cax"])
    const { ids, offsets } = encodeUnigram(vocab, tokenizer, text)
    expect(
      [...ids]
        .map((id, i) => `${JSON.stringify(pieces[id])}@${offsets[i]}`)
        .join(" "),
    ).toMatchInlineSnapshot(`""▁the"@0 "▁ca"@4 "<unk>"@7"`)
  })
})

describe("step 8: mixed scripts, a latin word inside russian text", () => {
  const MIXED = "Он открыл Google Chrome и набрал 42 слова."
  const locale = new Intl.Locale("ru")
  const vocab = readVocab(VOCABS.ru)

  it("today: slugify romanizes everything so the latin word is indistinguishable and all stars", async () => {
    const { result } = await slugify(MIXED, locale, "")
    expect(`${result}\n${renderLabels(result, vocab)}`).toMatchInlineSnapshot(`
      "onotkrylgooglechromeinabralsorokdvaslova
      chars    o  n  o  t  k  r  y  l  g  o  o  g  l  e  c  h  r  o  m  e  i  n  a  b  r  a  l  s  o  r  o  k  d  v  a  s  l  o  v  a
       labels   *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *
       stars    40 of 40"
    `)
  })

  it("vocab-targeted, dropping every non-vocab char: the latin word and the digits vanish", async () => {
    const { result } = await transliterate(MIXED.toLocaleLowerCase(locale), {
      locale,
      ignore: [...vocab.keys()].filter((k) => k.length === 1 && k !== "|"),
    })
    const kept = result
      .split("")
      .filter((c) => vocab.has(c))
      .join("")
    expect(`${result}\n${renderLabels(kept, vocab)}`).toMatchInlineSnapshot(`
      "он открыл google chrome и набрал 42 слова.
      chars    о  н  о  т  к  р  ы  л  и  н  а  б  р  а  л  с  л  о  в  а
       labels  16 15 16 20 12 18 29 13 10 15  1  2 18  1 13 19 13 16  3  1
       stars    0 of 20"
    `)
  })

  it("vocab-targeted, keeping foreign letters as stars: the word survives as a wildcard run", async () => {
    const { result } = await transliterate(MIXED.toLocaleLowerCase(locale), {
      locale,
      ignore: [...vocab.keys()].filter((k) => k.length === 1 && k !== "|"),
    })
    const kept = result
      .split("")
      .filter((c) => vocab.has(c) || /\p{L}/u.test(c))
      .join("")
    expect(`${result}\n${renderLabels(kept, vocab)}`).toMatchInlineSnapshot(`
      "он открыл google chrome и набрал 42 слова.
      chars    о  н  о  т  к  р  ы  л  g  o  o  g  l  e  c  h  r  o  m  e  и  н  а  б  р  а  л  с  л  о  в  а
       labels  16 15 16 20 12 18 29 13  *  *  *  *  *  *  *  *  *  *  *  * 10 15  1  2 18  1 13 19 13 16  3  1
       stars    12 of 32"
    `)
  })

  describe("what the viterbi does with a star run", () => {
    const BLANK = 0
    const A = 1
    const B = 2
    const STAR = 4
    const STAR_SCORE = -3
    const NAMES: Record<number, string> = { [A]: "а", [B]: "б", [STAR]: "*" }

    function frame(blank: number, a: number, b: number, x: number) {
      return [blank, a, b, x]
    }

    function toy(foreignFrames: number, blankDuringForeign: number) {
      const rows = [
        ...Array.from({ length: 4 }, () => frame(-2, -0.2, -6, -6)),
        ...Array.from({ length: foreignFrames }, () =>
          frame(blankDuringForeign, -3.5, -3.5, -0.5),
        ),
        ...Array.from({ length: 4 }, () => frame(-2, -6, -0.2, -6)),
        ...Array.from({ length: 2 }, () => frame(-0.1, -6, -6, -6)),
      ]
      return {
        values: Float32Array.from(rows.flat()),
        frames: rows.length,
        classes: 4,
      }
    }

    function render(
      labels: number[],
      foreignFrames: number,
      blankDuringForeign: number,
    ) {
      const emissions = toy(foreignFrames, blankDuringForeign)
      const out = ctcViterbiAlign(emissions, labels, BLANK, STAR, STAR_SCORE)
      const lane = Array.from({ length: emissions.frames }, () => ".")
      for (const a of out) {
        for (let t = a.startFrame; t <= a.endFrame; t++) {
          lane[t] = NAMES[a.label]!
        }
      }
      const audio =
        "а".repeat(4) + "x".repeat(foreignFrames) + "б".repeat(4) + ".."
      return [
        `audio   ${audio}   (x = model hears a foreign word, blank there = ${blankDuringForeign})`,
        `path    ${lane.join("")}`,
        ...out.map(
          (a) =>
            `${NAMES[a.label]}  frames ${a.startFrame}..${a.endFrame}  mean ${a.score.toFixed(2)}`,
        ),
      ].join("\n")
    }

    it("model confident it hears letters (blank -4): stars stretch over the word at -3 each", () => {
      expect(render([A, STAR, STAR, STAR, B], 6, -4)).toMatchInlineSnapshot(`
        "audio   ааааxxxxxxбббб..   (x = model hears a foreign word, blank there = -4)
        path    аааа******бббб..
        а  frames 0..3  mean -0.20
        *  frames 4..4  mean -3.00
        *  frames 5..5  mean -3.00
        *  frames 6..9  mean -3.00
        б  frames 10..13  mean -0.20"
      `)
    })

    it("model unsure (blank -2.5): blank is cheaper than a star, stars get one frame each", () => {
      expect(render([A, STAR, STAR, STAR, B], 6, -2.5)).toMatchInlineSnapshot(`
        "audio   ааааxxxxxxбббб..   (x = model hears a foreign word, blank there = -2.5)
        path    аааа***...бббб..
        а  frames 0..3  mean -0.20
        *  frames 4..4  mean -3.00
        *  frames 5..5  mean -3.00
        *  frames 6..6  mean -3.00
        б  frames 10..13  mean -0.20"
      `)
    })

    it("word dropped from the labels, confident model: a neighbour or blank must pay for every frame", () => {
      expect(render([A, B], 6, -4)).toMatchInlineSnapshot(`
        "audio   ааааxxxxxxбббб..   (x = model hears a foreign word, blank there = -4)
        path    аааабббббббббб..
        а  frames 0..3  mean -0.20
        б  frames 4..13  mean -2.18"
      `)
    })

    it("long foreign speech, confident model: the star run still covers all of it", () => {
      expect(render([A, STAR, STAR, B], 20, -4)).toMatchInlineSnapshot(`
        "audio   ааааxxxxxxxxxxxxxxxxxxxxбббб..   (x = model hears a foreign word, blank there = -4)
        path    аааа********************бббб..
        а  frames 0..3  mean -0.20
        *  frames 4..4  mean -3.00
        *  frames 5..23  mean -3.00
        б  frames 24..27  mean -0.20"
      `)
    })
  })
})

describe("step 9: prototype of a vocab-targeted slugify, the shape the real change would take", () => {
  const ARABIC_VOCAB =
    "▁ ء ؤ ئ ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي <unk> <pad> <blk>"
  const CHINESE_VOCAB =
    "▁ 我 们 今 天 去 北 京 看 长 城 四 十 二 只 猫 有 <blk>"

  function escapeClass(s: string) {
    return s.replace(/[\\\]^-]/g, "\\$&")
  }

  function foldArabic(text: string) {
    return text
      .normalize("NFC")
      .replace(/\p{M}/gu, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
  }

  async function slugifyToVocab(
    text: string,
    locale: Intl.Locale,
    vocab: Map<string, number>,
  ) {
    const chars = [...vocab.keys()].filter((k) => k.length === 1 && k !== "|")
    const ignore = [
      ...new Set(chars.flatMap((c) => [c, c.toLocaleUpperCase(locale)])),
    ]
    const { result, mapping } = await libSlugify(text, {
      ignore,
      replace: createReplacers(locale),
      allowedChars: `${escapeClass(chars.join(""))}a-zA-Z`,
      separator: "",
    })
    return { result, mapping }
  }

  it("russian: number words and a latin word, capitals from the replacer survive because ignore has both cases", async () => {
    const vocab = readVocab(VOCABS.ru)
    const { result } = await slugifyToVocab(
      "Съешь же ещё 42 булок. Он открыл Google Chrome.",
      new Intl.Locale("ru"),
      vocab,
    )
    expect(`${result}\n${renderLabels(result, vocab)}`).toMatchInlineSnapshot(`
      "съешьжеещёсорокдвабулоконоткрылgooglechrome
      chars    с  ъ  е  ш  ь  ж  е  е  щ  ё  с  о  р  о  к  д  в  а  б  у  л  о  к  о  н  о  т  к  р  ы  л  g  o  o  g  l  e  c  h  r  o  m  e
       labels  19 28  6 26 30  8  6  6 27  7 19 16 18 16 12  5  3  1  2 21 13 16 12 16 15 16 20 12 18 29 13  *  *  *  *  *  *  *  *  *  *  *  *
       stars    12 of 43"
    `)
  })

  it("arabic: diacritics and alef variants must be folded first, and the number locale needs a fallback", async () => {
    const vocab = readVocab(ARABIC_VOCAB)
    const text = "السَّلامُ عليكم، قرأت 42 كتاباً في المكتبة."
    const raw = await slugifyToVocab(text, new Intl.Locale("ar"), vocab)
    const folded = await slugifyToVocab(
      foldArabic(text),
      new Intl.Locale("ar-SA"),
      vocab,
    )
    expect(
      [
        `raw       ${raw.result}`,
        `          ${renderLabels(raw.result, vocab).split("\n").at(-1)!.trim()}`,
        `folded    ${folded.result}`,
        `          ${renderLabels(folded.result, vocab).split("\n").at(-1)!.trim()}`,
      ].join("\n"),
    ).toMatchInlineSnapshot(`
      "raw       السawلامuعليكمقرتاثنانوربعونكتاباanفيالمكتب
                stars    5 of 43
      folded    السلامعليكمقراتاثنانوربعونكتابافيالمكتبه
                stars    0 of 40"
    `)
  })

  it("chinese: the library routes zh, ja and he through transliterators that skip ignore, so the locale must be left off the library call", async () => {
    const vocab = readVocab(CHINESE_VOCAB)
    const text = "我们今天去北京看长城，有42只猫。"
    const chars = [...vocab.keys()].filter((k) => k.length === 1 && k !== "|")
    const withLocale = await libSlugify(text, {
      locale: new Intl.Locale("zh"),
      ignore: chars,
      replace: createReplacers(new Intl.Locale("zh")),
      allowedChars: `${escapeClass(chars.join(""))}a-zA-Z`,
      separator: "",
    })
    const without = await slugifyToVocab(text, new Intl.Locale("zh"), vocab)
    expect(
      [
        `with locale     ${withLocale.result}`,
        `without locale  ${without.result}`,
        `                ${renderLabels(without.result, vocab).split("\n").at(-1)!.trim()}`,
      ].join("\n"),
    ).toMatchInlineSnapshot(`
      "with locale     womenjintianqubeijingkanchangchengyousishierzhimao
      without locale  我们今天去北京看长城有四十二只猫
                      stars    0 of 16"
    `)
  })
})
