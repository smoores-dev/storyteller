import assert from "node:assert"
import { describe, it } from "node:test"

import {
  type ReportSpan,
  type ReportV4,
  assembleReport,
} from "@storyteller-platform/align/report"

import {
  type AlignmentDecisions,
  type AlignmentOverrides,
  type LegacyReport,
  type ReportV3,
  buildReportView,
  fromLegacyReport,
  gradeForScore,
  mechanicalClassification,
  overridesToDecisions,
  summarizeReport,
  upgradeReportV3,
} from "@/alignmentReportView"
import { summarizeReport as summarizeColumns } from "@/database/alignmentReports"
import { ALIGNMENT_GRADES } from "@/fields"
import { type UUID } from "@/uuid"

const context = (matchedSentence: string) => ({
  prevSentence: null,
  matchedSentence,
  nextSentence: null,
})

type ChapterInput = {
  href: string
  spineIndex: number
  score: number
  chapterSentenceCount: number
  alignedSentenceCount?: number
  audioFiles?: { filepath: string; start: number; end: number }[]
}

const chapter = (input: ChapterInput) => ({
  href: input.href,
  spineIndex: input.spineIndex,
  chunk: 0,
  score: input.score,
  firstMatchedSentenceId: 0,
  firstMatchedSentenceContext: context(`${input.href} first`),
  lastMatchedSentenceId: input.chapterSentenceCount - 1,
  lastMatchedSentenceContext: context(`${input.href} last`),
  chapterSentenceCount: input.chapterSentenceCount,
  alignedSentenceCount:
    input.alignedSentenceCount ?? input.chapterSentenceCount,
  audioFiles: input.audioFiles ?? [
    { filepath: `/audio/${input.href}.mp3`, start: 0, end: 600 },
  ],
})

const notFound = (href: string, spineIndex: number, sentences: number) => ({
  href,
  spineIndex,
  score: 0,
  chapterSentenceCount: sentences,
  reason: "not-found" as const,
  start: `${href} starts here`,
  end: `${href} ends here`,
})

const audioFile = (filepath: string, duration: number) => ({
  filepath,
  duration,
})

const legacy = (input: Partial<LegacyReport>): LegacyReport => ({
  chapters: input.chapters ?? [],
  unalignedChapters: input.unalignedChapters ?? [],
  audioFiles: input.audioFiles ?? [],
  unalignedAudioFiles: input.unalignedAudioFiles ?? [],
})

type ItemInput = {
  index: number
  href: string
  sentences: number
  status?: ReportV4["spine"][number]["status"]
  classification?: ReportV4["spine"][number]["classification"]
  decision?: ReportV4["spine"][number]["decision"]
}

const item = (input: ItemInput) => ({
  index: input.index,
  href: input.href,
  title: null,
  status: input.status ?? ("aligned" as const),
  classification: input.classification ?? null,
  decision: input.decision ?? null,
  sentenceCount: input.sentences,
  firstMatch: null,
  lastMatch: null,
  preview: null,
})

const decide = (input: Partial<AlignmentDecisions>): AlignmentDecisions => ({
  chapters: input.chapters ?? {},
  audio: input.audio ?? [],
})

const ruled = (verdict: "exclude" | "review" | "include") => ({
  zone: "front" as const,
  verdict,
  decidedBy: { source: "landmark" as const, value: "cover", verdict },
  signals: [{ source: "landmark" as const, value: "cover", verdict }],
})

const track = (index: number, name: string, duration: number, offset = 0) => ({
  index,
  name,
  duration,
  offset,
  source: null,
})

const aligned = (
  spine: number,
  first: number,
  last: number,
  audio: { track: number; start: number; end: number },
  score: number | null = 90,
): ReportSpan => ({
  spine,
  firstSentence: first,
  lastSentence: last,
  state: "aligned",
  audio,
  score,
})

const interpolated = (
  spine: number,
  first: number,
  last: number,
  audio: { track: number; start: number; end: number },
): ReportSpan => ({
  spine,
  firstSentence: first,
  lastSentence: last,
  state: "interpolated",
  audio,
})

const unmatched = (spine: number, first: number, last: number): ReportSpan => ({
  spine,
  firstSentence: first,
  lastSentence: last,
  state: "unmatched",
  audio: null,
})

type ReportInput = Omit<Parameters<typeof assembleReport>[0], "autoExclude"> & {
  autoExclude?: boolean
}

const report = (input: ReportInput) =>
  assembleReport({ autoExclude: true, ...input })

void describe("gradeForScore", () => {
  void it("numbers the bands in grade order", () => {
    const cases: [number, number, (typeof ALIGNMENT_GRADES)[number]][] = [
      [95, 98, "S"],
      [90, 96, "A"],
      [89, 97, "B"],
      [95, 90, "C"],
      [60, 60, "D"],
      [40, 40, "F"],
    ]
    for (const [sentences, audio, grade] of cases) {
      const result = gradeForScore(sentences, audio)
      assert.strictEqual(result.grade, grade)
      assert.strictEqual(result.band, ALIGNMENT_GRADES.indexOf(grade))
    }
  })

  void it("only awards S when both sentences and audio are near perfect", () => {
    assert.deepStrictEqual(gradeForScore(100, 90), {
      grade: "C",
      band: 3,
      score: 97,
    })
    assert.strictEqual(gradeForScore(98, 98).grade, "S")
    assert.strictEqual(gradeForScore(100, 96).grade, "A")
  })

  void it("fails a report with no score at all", () => {
    assert.deepStrictEqual(gradeForScore(null, null), {
      grade: "F",
      band: ALIGNMENT_GRADES.length - 1,
      score: 0,
    })
  })
})

void describe("the score", () => {
  const base = report({
    aligner: "ctc",
    spine: [item({ index: 1, href: "a.xhtml", sentences: 100 })],
    tracks: [track(0, "1.mp3", 1000)],
    spans: [
      aligned(1, 0, 79, { track: 0, start: 0, end: 500 }, 90),
      unmatched(1, 80, 99),
    ],
  })

  void it("weighs sentences seventy percent and audio thirty", () => {
    const summary = summarizeReport(base)
    assert.strictEqual(summary.sentencesMatched, 80)
    assert.strictEqual(summary.sentencesTotal, 100)
    assert.strictEqual(summary.audioPlacedSeconds, 500)
    assert.strictEqual(summary.audioTotalSeconds, 1000)
    assert.strictEqual(summary.score, 0.8 * 70 + 0.5 * 30)
    assert.strictEqual(summary.grade, "D")
  })

  void it("credits single interpolated sentences between matches", () => {
    const summary = summarizeReport(
      report({
        aligner: "ctc",
        spine: [item({ index: 1, href: "a.xhtml", sentences: 10 })],
        tracks: [track(0, "1.mp3", 100)],
        spans: [
          aligned(1, 0, 3, { track: 0, start: 0, end: 40 }),
          interpolated(1, 4, 4, { track: 0, start: 40, end: 50 }),
          aligned(1, 5, 5, { track: 0, start: 50, end: 60 }),
          interpolated(1, 6, 8, { track: 0, start: 60, end: 90 }),
          aligned(1, 9, 9, { track: 0, start: 90, end: 100 }),
        ],
      }),
    )
    assert.strictEqual(summary.sentencesMatched, 7)
    assert.strictEqual(summary.sentencesTotal, 10)
    assert.strictEqual(summary.audioPlacedSeconds, 100)
  })

  void it("measures audio against the audiobook duration when known", () => {
    const summary = summarizeReport(base, null, 2000)
    assert.strictEqual(summary.audioPlacedSeconds, 500)
    assert.strictEqual(summary.audioTotalSeconds, 2000)
    assert.strictEqual(summary.audioCoverage, 25)
    assert.strictEqual(summary.looseSeconds, 1500)
  })

  void it("takes excluded tracks out of the audiobook duration", () => {
    const summary = summarizeReport(
      report({
        aligner: "ctc",
        spine: [item({ index: 1, href: "a.xhtml", sentences: 100 })],
        tracks: [track(0, "1.mp3", 600), track(1, "2.mp3", 400, 600)],
        spans: [aligned(1, 0, 99, { track: 0, start: 0, end: 600 })],
      }),
      decide({ audio: [{ track: "2.mp3", start: null, end: null }] }),
      1000,
    )
    assert.strictEqual(summary.audioTotalSeconds, 600)
    assert.strictEqual(summary.audioCoverage, 100)
  })

  void it("fails when no audio is known", () => {
    const summary = summarizeReport(
      report({
        aligner: "ctc",
        spine: [item({ index: 1, href: "a.xhtml", sentences: 100 })],
        tracks: [],
        spans: [unmatched(1, 0, 99)],
      }),
    )
    assert.strictEqual(summary.audioTotalSeconds, 0)
    assert.strictEqual(summary.audioCoverage, null)
    assert.strictEqual(summary.score, 0)
    assert.strictEqual(summary.grade, "F")
    assert.strictEqual(summary.failed, 1)
  })

  void it("reports the aligner score separately, weighted by sentences", () => {
    const summary = summarizeReport(
      report({
        aligner: "ctc",
        spine: [
          item({ index: 1, href: "a.xhtml", sentences: 100 }),
          item({ index: 2, href: "b.xhtml", sentences: 300 }),
        ],
        tracks: [track(0, "1.mp3", 1000)],
        spans: [
          aligned(1, 0, 99, { track: 0, start: 0, end: 200 }, 80),
          aligned(2, 0, 299, { track: 0, start: 200, end: 1000 }, 100),
        ],
      }),
    )
    assert.strictEqual(summary.confidence, 95)
  })

  void it("has no score when nothing counts", () => {
    const summary = summarizeReport(
      base,
      decide({ chapters: { "a.xhtml": "excluded" } }),
    )
    assert.strictEqual(summary.sentencesTotal, 0)
    assert.strictEqual(summary.score, 0)
    assert.strictEqual(summary.grade, "F")
    assert.strictEqual(summary.confidence, null)
  })

  void it("leaves navigation and empty items out of the denominator", () => {
    const summary = summarizeReport(
      report({
        aligner: "ctc",
        spine: [
          item({
            index: 0,
            href: "nav.xhtml",
            sentences: 0,
            status: "excluded",
            classification: mechanicalClassification("nav", 0, 3),
          }),
          item({ index: 1, href: "a.xhtml", sentences: 10 }),
          item({
            index: 2,
            href: "t.xhtml",
            sentences: 1,
            status: "too-short",
          }),
        ],
        tracks: [track(0, "1.mp3", 100)],
        spans: [
          aligned(1, 0, 9, { track: 0, start: 0, end: 100 }),
          unmatched(2, 0, 0),
        ],
      }),
    )
    assert.strictEqual(summary.chapters, 1)
    assert.strictEqual(summary.sentencesTotal, 10)
    assert.strictEqual(summary.sentenceCoverage, 100)
  })
})

void describe("judgments", () => {
  const base = report({
    aligner: "ctc",
    spine: [
      item({ index: 1, href: "a.xhtml", sentences: 100 }),
      item({ index: 2, href: "b.xhtml", sentences: 100 }),
    ],
    tracks: [track(0, "1.mp3", 600), track(1, "2.mp3", 600, 600)],
    spans: [
      aligned(1, 0, 59, { track: 0, start: 0, end: 600 }, 60),
      unmatched(1, 60, 99),
      aligned(2, 0, 99, { track: 1, start: 0, end: 600 }, 100),
    ],
  })

  void it("approving makes the denominator match the numerator", () => {
    const summary = summarizeReport(
      base,
      decide({ chapters: { "a.xhtml": "approved" } }),
    )
    assert.strictEqual(summary.sentencesMatched, 160)
    assert.strictEqual(summary.sentencesTotal, 160)
    assert.strictEqual(summary.confidence, 100)
    assert.strictEqual(summary.approved, 1)
    assert.strictEqual(summary.audioPlacedSeconds, 1200)
  })

  void it("excluding drops the chapter but leaves the track counted", () => {
    const summary = summarizeReport(
      base,
      decide({ chapters: { "a.xhtml": "excluded" } }),
    )
    assert.strictEqual(summary.sentencesMatched, 100)
    assert.strictEqual(summary.sentencesTotal, 100)
    assert.strictEqual(summary.excluded, 1)
    assert.strictEqual(summary.audioTotalSeconds, 1200)
  })

  void it("excluding a track drops it from the audio totals", () => {
    const summary = summarizeReport(
      base,
      decide({ audio: [{ track: "1.mp3", start: null, end: null }] }),
    )
    assert.strictEqual(summary.audioPlacedSeconds, 600)
    assert.strictEqual(summary.audioTotalSeconds, 600)
    assert.strictEqual(summary.sentencesTotal, 200)
  })

  void it("reads the legacy ignored flag as excluded", () => {
    const overrides: AlignmentOverrides = {
      chapters: { "a.xhtml": { ignored: true } },
      audioFiles: { "2.mp3": { ignored: true } },
    }
    const view = buildReportView({
      report: base,
      bookUuid: "b" as UUID,
      bookTitle: null,
      reportUuid: "r" as UUID,
      jobUuid: null,
      createdAt: "",
      latest: true,
      playback: { readaloud: null, original: true },
      decisions: overridesToDecisions(overrides),
    })
    assert.strictEqual(view.items[0]?.judgment, "excluded")
    assert.strictEqual(view.items[0].pending, true)
    assert.strictEqual(view.tracks[1]?.excluded, true)
  })

  void it("excludes only the masked seconds of a track", () => {
    const summary = summarizeReport(
      base,
      decide({
        audio: [
          { track: "1.mp3", start: 100, end: 200 },
          { track: "1.mp3", start: 150, end: 250 },
        ],
      }),
    )
    assert.strictEqual(summary.audioTotalSeconds, 1050)
    assert.strictEqual(summary.audioPlacedSeconds, 1200)
    assert.strictEqual(summary.audioCoverage, 100)
  })

  void it("counts every not-found chapter as zero until it is judged", () => {
    const withMissing = report({
      aligner: "ctc",
      spine: [
        ...base.spine,
        item({
          index: 9,
          href: "notes.xhtml",
          sentences: 50,
          status: "not-found",
        }),
      ],
      tracks: base.tracks,
      spans: [...base.spans, unmatched(9, 0, 49)],
    })
    const plain = summarizeReport(withMissing)
    assert.strictEqual(plain.sentencesTotal, 250)
    assert.strictEqual(plain.sentencesMatched, 160)
    assert.strictEqual(plain.failed, 1)

    const judged = summarizeReport(
      withMissing,
      decide({ chapters: { "notes.xhtml": "excluded" } }),
    )
    assert.strictEqual(judged.sentencesTotal, 200)
  })
})

void describe("exclusions", () => {
  const base = report({
    aligner: "ctc",
    spine: [
      item({
        index: 0,
        href: "cover.xhtml",
        sentences: 0,
        status: "excluded",
        classification: ruled("exclude"),
      }),
      item({
        index: 1,
        href: "foreword.xhtml",
        sentences: 10,
        classification: ruled("review"),
      }),
      item({ index: 2, href: "a.xhtml", sentences: 100 }),
      item({
        index: 3,
        href: "b.xhtml",
        sentences: 100,
        status: "excluded",
        decision: "excluded",
      }),
    ],
    tracks: [track(0, "1.mp3", 1000)],
    spans: [
      aligned(1, 0, 9, { track: 0, start: 0, end: 100 }),
      aligned(2, 0, 99, { track: 0, start: 100, end: 1000 }),
    ],
  })

  void it("counts what the rules skipped and what deserves a listen", () => {
    const summary = summarizeReport(
      base,
      decide({ chapters: { "b.xhtml": "excluded" } }),
    )
    assert.strictEqual(summary.chapters, 2)
    assert.strictEqual(summary.excludedByRule, 1)
    assert.strictEqual(summary.excluded, 1)
    assert.strictEqual(summary.review, 1)
    assert.strictEqual(summary.pending, 0)
  })

  void it("marks decisions that only apply on the next run as pending", () => {
    const summary = summarizeReport(
      base,
      decide({
        chapters: { "cover.xhtml": "included", "a.xhtml": "excluded" },
      }),
    )
    assert.strictEqual(summary.pending, 3)
    assert.strictEqual(summary.excluded, 1)
    assert.strictEqual(summary.excludedByRule, 1)
  })

  void it("settles a review once the chapter is judged", () => {
    const summary = summarizeReport(
      base,
      decide({
        chapters: { "foreword.xhtml": "approved", "b.xhtml": "excluded" },
      }),
    )
    assert.strictEqual(summary.review, 0)
    assert.strictEqual(summary.approved, 1)
  })

  void it("upgrades a version three report", () => {
    const v3: ReportV3 = {
      version: 3,
      aligner: "ctc",
      spine: [
        {
          ...item({ index: 0, href: "nav.xhtml", sentences: 0 }),
          status: "is-nav",
          matchedSentenceCount: 0,
          interpolatedSentenceCount: 0,
          droppedSentenceCount: 0,
          matchedSeconds: 0,
          interpolatedSeconds: 0,
          looseSeconds: 0,
          score: null,
        },
      ],
      tracks: [
        {
          ...track(0, "1.mp3", 100),
          matchedSeconds: 0,
          interpolatedSeconds: 0,
          looseSeconds: 0,
        },
      ],
      spans: [],
      holes: [],
      totals: {
        sentences: 0,
        matchedSentences: 0,
        interpolatedSentences: 0,
        unmatchedSentences: 0,
        droppedSentences: 0,
        seconds: 100,
        matchedSeconds: 0,
        interpolatedSeconds: 0,
        looseSeconds: 0,
        spine: {
          aligned: 0,
          "not-found": 0,
          "too-short": 0,
          "is-nav": 1,
          "no-text": 0,
          excluded: 0,
          "audio-only": 0,
        },
        tracks: 1,
        unalignedTracks: 1,
      },
    }
    const upgraded = upgradeReportV3(v3)
    assert.strictEqual(upgraded.version, 4)
    assert.strictEqual(upgraded.autoExclude, false)
    assert.strictEqual(upgraded.spine[0]?.status, "excluded")
    assert.strictEqual(
      upgraded.spine[0].classification?.decidedBy?.source,
      "nav",
    )
    assert.deepStrictEqual(upgraded.tracks[0]?.excluded, [])
    assert.strictEqual(upgraded.totals.spine.excluded, 1)
  })
})

void describe("labels", () => {
  const view = (input: ReportV4, manifest?: object) =>
    buildReportView({
      report: input,
      bookUuid: "b" as UUID,
      bookTitle: null,
      reportUuid: "r" as UUID,
      jobUuid: null,
      createdAt: "",
      latest: true,
      playback: { readaloud: null, original: true },
      ebookManifest: manifest ?? null,
    })

  void it("prefers the report title, then the manifest, then the stem", () => {
    const { items } = view(
      report({
        aligner: "ctc",
        spine: [
          {
            ...item({ index: 1, href: "chapter001.xhtml", sentences: 10 }),
            title: "From the aligner",
          },
          item({
            index: 2,
            href: "part001.xhtml",
            sentences: 2,
            status: "not-found",
          }),
          item({ index: 3, href: "text/ch03.xhtml", sentences: 2 }),
        ],
        tracks: [track(0, "1.mp3", 100)],
        spans: [
          aligned(1, 0, 9, { track: 0, start: 0, end: 100 }),
          unmatched(2, 0, 1),
          aligned(3, 0, 1, { track: 0, start: 0, end: 100 }),
        ],
      }),
      {
        toc: [
          {
            href: "OEBPS/part001.xhtml",
            title: "Part I",
            children: [
              { href: "OEBPS/chapter001.xhtml", title: "Chapter 1: Hello" },
            ],
          },
        ],
      },
    )
    assert.deepStrictEqual(
      items.map((entry) => [entry.label, entry.title]),
      [
        ["From the aligner", "From the aligner"],
        ["Part I", "Part I"],
        ["ch03", null],
      ],
    )
  })

  void it("resolves the read href from the reading order", () => {
    const { items } = view(
      report({
        aligner: "ctc",
        spine: [item({ index: 1, href: "chapter001.xhtml", sentences: 10 })],
        tracks: [track(0, "1.mp3", 100)],
        spans: [aligned(1, 0, 9, { track: 0, start: 0, end: 100 })],
      }),
      { readingOrder: [{ href: "OEBPS/chapter001.xhtml#top" }] },
    )
    assert.strictEqual(items[0]?.readHref, "OEBPS/chapter001.xhtml")
  })
})

void describe("legacy reports", () => {
  void it("orders tracks by name and stacks their offsets", () => {
    const converted = fromLegacyReport(
      legacy({
        chapters: [
          chapter({
            href: "a.xhtml",
            spineIndex: 1,
            score: 90,
            chapterSentenceCount: 10,
            audioFiles: [{ filepath: "/audio/10.mp3", start: 0, end: 100 }],
          }),
        ],
        audioFiles: [
          audioFile("/audio/10.mp3", 100),
          audioFile("/audio/2.mp3", 50),
        ],
      }),
    )
    assert.deepStrictEqual(
      converted.tracks.map((entry) => [entry.name, entry.offset]),
      [
        ["2.mp3", 0],
        ["10.mp3", 50],
      ],
    )
    assert.strictEqual(converted.totals.unalignedTracks, 1)
  })

  void it("turns a chapter hull into an aligned span with unmatched edges", () => {
    const converted = fromLegacyReport(
      legacy({
        chapters: [
          {
            ...chapter({
              href: "a.xhtml",
              spineIndex: 1,
              score: 90,
              chapterSentenceCount: 10,
              alignedSentenceCount: 5,
              audioFiles: [{ filepath: "/audio/1.mp3", start: 10, end: 60 }],
            }),
            firstMatchedSentenceId: 2,
            lastMatchedSentenceId: 7,
          },
        ],
        audioFiles: [audioFile("/audio/1.mp3", 100)],
      }),
    )
    assert.deepStrictEqual(
      converted.spans.map((span) => [
        span.state,
        span.firstSentence,
        span.lastSentence,
      ]),
      [
        ["unmatched", 0, 1],
        ["aligned", 2, 7],
        ["unmatched", 8, 9],
      ],
    )
    const [first] = converted.spine
    assert.strictEqual(first?.matchedSentenceCount, 5)
    assert.strictEqual(first.interpolatedSentenceCount, 1)
    assert.strictEqual(first.score, 90)
    assert.strictEqual(converted.totals.matchedSentences, 5)
  })

  void it("collapses chunk rows into one chapter with a weighted score", () => {
    const converted = fromLegacyReport(
      legacy({
        chapters: [
          {
            ...chapter({
              href: "long.xhtml",
              spineIndex: 4,
              score: 80,
              chapterSentenceCount: 100,
              audioFiles: [{ filepath: "/audio/1.mp3", start: 0, end: 300 }],
            }),
            chunk: 0,
          },
          {
            ...chapter({
              href: "long.xhtml",
              spineIndex: 4,
              score: 100,
              chapterSentenceCount: 300,
              audioFiles: [{ filepath: "/audio/1.mp3", start: 300, end: 900 }],
            }),
            chunk: 1,
            firstMatchedSentenceId: 100,
            lastMatchedSentenceId: 399,
          },
        ],
        audioFiles: [audioFile("/audio/1.mp3", 900)],
      }),
    )
    assert.strictEqual(converted.spine.length, 1)
    assert.strictEqual(converted.spine[0]?.sentenceCount, 400)
    assert.strictEqual(converted.spine[0].score, 95)
    assert.deepStrictEqual(
      converted.spans.map((span) => span.audio),
      [{ track: 0, start: 0, end: 900 }],
    )
  })

  void it("folds a missed chunk into its found chapter", () => {
    const converted = fromLegacyReport(
      legacy({
        chapters: [
          chapter({
            href: "long.xhtml",
            spineIndex: 4,
            score: 80,
            chapterSentenceCount: 100,
          }),
        ],
        unalignedChapters: [notFound("long.xhtml", 4, 50)],
      }),
    )
    assert.strictEqual(converted.spine.length, 1)
    assert.strictEqual(converted.spine[0]?.sentenceCount, 150)
    assert.strictEqual(converted.spine[0].status, "aligned")
  })

  void it("keeps unaligned reasons and previews", () => {
    const converted = fromLegacyReport(
      legacy({
        chapters: [],
        unalignedChapters: [
          { href: "nav.xhtml", reason: "is-nav" },
          notFound("mid.xhtml", 3, 4),
        ],
      }),
    )
    assert.deepStrictEqual(
      converted.spine.map((entry) => [entry.href, entry.status, entry.preview]),
      [
        ["nav.xhtml", "excluded", null],
        ["mid.xhtml", "not-found", "mid.xhtml starts here"],
      ],
    )
    assert.deepStrictEqual(converted.spans, [unmatched(3, 0, 3)])
  })
})

void describe("summarizeReport for the stored columns", () => {
  void it("fills the summary columns from either report shape", () => {
    const summary = summarizeColumns(
      legacy({
        chapters: [
          chapter({
            href: "a.xhtml",
            spineIndex: 1,
            score: 90,
            chapterSentenceCount: 100,
            alignedSentenceCount: 90,
            audioFiles: [{ filepath: "/audio/1.mp3", start: 0, end: 600 }],
          }),
          chapter({
            href: "b.xhtml",
            spineIndex: 2,
            score: 0,
            chapterSentenceCount: 50,
            alignedSentenceCount: 0,
            audioFiles: [],
          }),
        ],
        unalignedChapters: [
          notFound("c.xhtml", 3, 20),
          notFound("d.xhtml", 4, 20),
        ],
        audioFiles: [audioFile("/audio/1.mp3", 600)],
        unalignedAudioFiles: [{ filepath: "/audio/2.mp3", duration: 60 }],
      }),
      decide({ chapters: { "d.xhtml": "excluded" } }),
    )
    assert.strictEqual(summary.chapters, 4)
    assert.strictEqual(summary.missingSentences, 80)
    assert.strictEqual(summary.failedChapters, 2)
    assert.strictEqual(summary.unalignedAudio, 1)
    assert.strictEqual(summary.grade, "D")
  })
})
