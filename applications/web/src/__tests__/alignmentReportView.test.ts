import assert from "node:assert"
import { describe, it } from "node:test"

import {
  GRADE_BANDS,
  type ReportChapterItem,
  type ReportUnalignedItem,
  buildReportModel,
  gradeForScore,
} from "@/alignmentReportView"
import {
  type AlignmentOverrides,
  type AnyReport,
  summarizeReport,
} from "@/database/alignmentReports"

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
  transcriptionOffset: 0,
  endTranscriptionOffset: 100,
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

const audioFile = (filepath: string, duration: number, aligned: number) => ({
  filepath,
  duration,
  alignedDuration: aligned,
  matchedRanges: [],
})

const makeReport = (input: {
  chapters: AnyReport["chapters"]
  unalignedChapters?: AnyReport["unalignedChapters"]
  audioFiles?: AnyReport["audioFiles"]
  unalignedAudioFiles?: AnyReport["unalignedAudioFiles"]
}) =>
  ({
    chapters: input.chapters,
    unalignedChapters: input.unalignedChapters ?? [],
    audioFiles: input.audioFiles ?? [],
    unalignedAudioFiles: input.unalignedAudioFiles ?? [],
  }) as AnyReport

const chapterItems = (items: ReturnType<typeof buildReportModel>["items"]) =>
  items.filter((item): item is ReportChapterItem => item.kind === "chapter")

const unalignedItems = (items: ReturnType<typeof buildReportModel>["items"]) =>
  items.filter((item): item is ReportUnalignedItem => item.kind === "unaligned")

void describe("gradeForScore", () => {
  void it("maps every band edge to its grade", () => {
    for (const [band, entry] of GRADE_BANDS.entries()) {
      const at = Number.isFinite(entry.min) ? entry.min : 0
      assert.deepStrictEqual(gradeForScore(at), { grade: entry.grade, band })
    }
    assert.deepStrictEqual(gradeForScore(94.9), { grade: "A", band: 1 })
  })

  void it("fails a report with no score at all", () => {
    assert.deepStrictEqual(gradeForScore(null), {
      grade: "F",
      band: GRADE_BANDS.length - 1,
    })
  })
})

void describe("the score", () => {
  const report = makeReport({
    chapters: [
      chapter({
        href: "a.xhtml",
        spineIndex: 1,
        score: 90,
        chapterSentenceCount: 100,
        alignedSentenceCount: 80,
        audioFiles: [{ filepath: "/audio/1.mp3", start: 0, end: 500 }],
      }),
    ],
    audioFiles: [audioFile("/audio/1.mp3", 1000, 500)],
  })

  void it("weighs sentences seventy percent and audio thirty", () => {
    const { summary } = buildReportModel({ report })
    assert.strictEqual(summary.sentencesAligned, 80)
    assert.strictEqual(summary.sentencesTotal, 100)
    assert.strictEqual(summary.audioPlacedSeconds, 500)
    assert.strictEqual(summary.audioTotalSeconds, 1000)
    assert.strictEqual(summary.score, 0.8 * 70 + 0.5 * 30)
    assert.strictEqual(summary.grade, "C")
  })

  void it("falls back to sentences alone when no audio is known", () => {
    const { summary } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "a.xhtml",
            spineIndex: 1,
            score: 90,
            chapterSentenceCount: 100,
            alignedSentenceCount: 90,
            audioFiles: [],
          }),
        ],
      }),
    })
    assert.strictEqual(summary.audioTotalSeconds, 0)
    assert.strictEqual(summary.score, 90)
    assert.strictEqual(summary.noAudio, 1)
  })

  void it("reports the aligner confidence separately, weighted by sentences", () => {
    const { summary } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "a.xhtml",
            spineIndex: 1,
            score: 80,
            chapterSentenceCount: 100,
          }),
          chapter({
            href: "b.xhtml",
            spineIndex: 2,
            score: 100,
            chapterSentenceCount: 300,
          }),
        ],
      }),
    })
    assert.strictEqual(summary.confidence, 95)
  })

  void it("has no score when nothing counts", () => {
    const { summary } = buildReportModel({
      report,
      overrides: { chapters: { "a.xhtml": { judgment: "excluded" } } },
    })
    assert.strictEqual(summary.sentencesTotal, 0)
    assert.strictEqual(summary.audioPlacedSeconds, 0)
    assert.strictEqual(summary.score, 0)
    assert.strictEqual(summary.grade, "F")
    assert.strictEqual(summary.confidence, null)
  })
})

void describe("judgments", () => {
  const report = makeReport({
    chapters: [
      chapter({
        href: "a.xhtml",
        spineIndex: 1,
        score: 60,
        chapterSentenceCount: 100,
        alignedSentenceCount: 60,
        audioFiles: [{ filepath: "/audio/1.mp3", start: 0, end: 600 }],
      }),
      chapter({
        href: "b.xhtml",
        spineIndex: 2,
        score: 100,
        chapterSentenceCount: 100,
        audioFiles: [{ filepath: "/audio/2.mp3", start: 0, end: 600 }],
      }),
    ],
    audioFiles: [
      audioFile("/audio/1.mp3", 600, 600),
      audioFile("/audio/2.mp3", 600, 600),
    ],
  })

  void it("approving makes the denominator match the numerator", () => {
    const { summary, items } = buildReportModel({
      report,
      overrides: { chapters: { "a.xhtml": { judgment: "approved" } } },
    })
    assert.strictEqual(summary.sentencesAligned, 160)
    assert.strictEqual(summary.sentencesTotal, 160)
    assert.strictEqual(summary.confidence, 100)
    assert.strictEqual(summary.approved, 1)
    assert.strictEqual(chapterItems(items)[0]?.judgment, "approved")
  })

  void it("approving leaves the audio as it was", () => {
    const { summary, audioFiles } = buildReportModel({
      report,
      overrides: { chapters: { "a.xhtml": { judgment: "approved" } } },
    })
    assert.strictEqual(summary.audioPlacedSeconds, 1200)
    assert.strictEqual(audioFiles[0]?.placedSeconds, 600)
  })

  void it("excluding drops the chapter and unplaces its audio", () => {
    const { summary, audioFiles } = buildReportModel({
      report,
      overrides: { chapters: { "a.xhtml": { judgment: "excluded" } } },
    })
    assert.strictEqual(summary.sentencesAligned, 100)
    assert.strictEqual(summary.sentencesTotal, 100)
    assert.strictEqual(summary.excluded, 1)
    assert.strictEqual(summary.audioPlacedSeconds, 600)
    assert.strictEqual(summary.audioTotalSeconds, 1200)
    assert.strictEqual(summary.looseAudio, 1)
    const first = audioFiles[0]
    assert.strictEqual(first?.placedSeconds, 0)
    assert.deepStrictEqual(
      first.chunks.map((chunk) => [chunk.placed, chunk.href]),
      [[false, "a.xhtml"]],
    )
  })

  void it("excluding an audio file drops it from the audio totals", () => {
    const { summary, audioFiles } = buildReportModel({
      report,
      overrides: { audioFiles: { "1.mp3": { excluded: true } } },
    })
    assert.strictEqual(summary.audioPlacedSeconds, 600)
    assert.strictEqual(summary.audioTotalSeconds, 600)
    assert.strictEqual(audioFiles[0]?.excluded, true)
    assert.strictEqual(summary.sentencesTotal, 200)
  })

  void it("reads the legacy ignored flag as excluded", () => {
    const overrides: AlignmentOverrides = {
      chapters: { "a.xhtml": { ignored: true } },
      audioFiles: { "2.mp3": { ignored: true } },
    }
    const { items, audioFiles } = buildReportModel({ report, overrides })
    assert.strictEqual(chapterItems(items)[0]?.judgment, "excluded")
    assert.strictEqual(audioFiles[1]?.excluded, true)
  })

  void it("counts every not-found chapter as zero until it is judged", () => {
    const withMissing = makeReport({
      chapters: report.chapters,
      unalignedChapters: [notFound("notes.xhtml", 9, 50)],
    })
    const plain = buildReportModel({ report: withMissing })
    assert.strictEqual(plain.summary.sentencesTotal, 250)
    assert.strictEqual(plain.summary.sentencesAligned, 160)

    const judged = buildReportModel({
      report: withMissing,
      overrides: {
        unalignedChapters: { "notes.xhtml": { judgment: "excluded" } },
      },
    })
    assert.strictEqual(judged.summary.sentencesTotal, 200)
    assert.strictEqual(unalignedItems(judged.items)[0]?.judgment, "excluded")
  })
})

void describe("the audio timeline", () => {
  const report = makeReport({
    chapters: [
      chapter({
        href: "a.xhtml",
        spineIndex: 1,
        score: 90,
        chapterSentenceCount: 10,
        audioFiles: [{ filepath: "/audio/00002.mp3", start: 5, end: 100 }],
      }),
      chapter({
        href: "b.xhtml",
        spineIndex: 2,
        score: 90,
        chapterSentenceCount: 10,
        audioFiles: [
          { filepath: "/audio/00002.mp3", start: 98, end: 150 },
          { filepath: "/audio/00010.mp3", start: 0, end: 40 },
        ],
      }),
    ],
    audioFiles: [
      audioFile("/audio/00002.mp3", 200, 145),
      audioFile("/audio/00010.mp3", 40, 40),
    ],
    unalignedAudioFiles: [{ filepath: "/audio/00001.mp3", duration: 30 }],
  })

  void it("lists files in numeric name order", () => {
    const { audioFiles } = buildReportModel({ report })
    assert.deepStrictEqual(
      audioFiles.map((file) => file.name),
      ["00001.mp3", "00002.mp3", "00010.mp3"],
    )
  })

  void it("fills leading, middle and trailing gaps with unplaced chunks", () => {
    const { audioFiles } = buildReportModel({ report })
    const second = audioFiles[1]
    assert.deepStrictEqual(
      second?.chunks.map((chunk) => [
        chunk.start,
        chunk.end,
        chunk.placed,
        chunk.href,
      ]),
      [
        [0, 5, false, null],
        [5, 100, true, "a.xhtml"],
        [100, 150, true, "b.xhtml"],
        [150, 200, false, null],
      ],
    )
    assert.strictEqual(second.placedSeconds, 145)
  })

  void it("marks a wholly unplaced file as one loose chunk", () => {
    const { audioFiles, summary } = buildReportModel({ report })
    const first = audioFiles[0]
    assert.strictEqual(first?.duration, 30)
    assert.deepStrictEqual(
      first.chunks.map((chunk) => [chunk.placed, chunk.duration]),
      [[false, 30]],
    )
    assert.strictEqual(summary.looseAudio, 2)
    assert.strictEqual(summary.looseSeconds, 85)
  })

  void it("tells a chapter which files it shares", () => {
    const { items } = buildReportModel({ report })
    const [a, b] = chapterItems(items)
    assert.deepStrictEqual(a?.audio[0]?.sharedWith, [
      { href: "b.xhtml", label: "b", role: "after" },
    ])
    assert.deepStrictEqual(b?.audio[0]?.sharedWith, [
      { href: "a.xhtml", label: "a", role: "before" },
    ])
    assert.deepStrictEqual(b.audio[1]?.sharedWith, [])
  })
})

void describe("labels", () => {
  void it("prefers the manifest title, including nested entries", () => {
    const { items } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "chapter001.xhtml",
            spineIndex: 3,
            score: 90,
            chapterSentenceCount: 10,
          }),
        ],
        unalignedChapters: [notFound("part001.xhtml", 2, 2)],
      }),
      ebookManifest: {
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
    })
    assert.deepStrictEqual(
      items.map((item) => [item.label, item.title]),
      [
        ["Part I", "Part I"],
        ["Chapter 1: Hello", "Chapter 1: Hello"],
      ],
    )
  })

  void it("resolves the read href and sentence ids for a chapter", () => {
    const { items } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "chapter001.xhtml",
            spineIndex: 3,
            score: 90,
            chapterSentenceCount: 10,
          }),
        ],
      }),
      ebookManifest: {
        readingOrder: [{ href: "OEBPS/chapter001.xhtml#top" }],
      },
    })
    const [item] = chapterItems(items)
    assert.strictEqual(item?.readHref, "OEBPS/chapter001.xhtml")
    assert.strictEqual(item.firstMatchedSentenceId, 0)
    assert.strictEqual(item.lastMatchedSentenceId, 9)
  })

  void it("falls back to the href stem", () => {
    const { items } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "text/ch01.xhtml",
            spineIndex: 1,
            score: 90,
            chapterSentenceCount: 10,
          }),
        ],
      }),
    })
    assert.deepStrictEqual(
      items.map((item) => [item.label, item.title]),
      [["ch01", null]],
    )
  })
})

void describe("item ordering", () => {
  void it("pins spine-index-less items to the top and sorts the rest", () => {
    const { items } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "b.xhtml",
            spineIndex: 5,
            score: 90,
            chapterSentenceCount: 10,
          }),
          chapter({
            href: "a.xhtml",
            spineIndex: 2,
            score: 90,
            chapterSentenceCount: 10,
          }),
        ],
        unalignedChapters: [
          { href: "nav.xhtml", reason: "is-nav" },
          notFound("mid.xhtml", 3, 4),
        ],
      }),
    })
    assert.deepStrictEqual(
      items.map((item) => item.href),
      ["nav.xhtml", "a.xhtml", "mid.xhtml", "b.xhtml"],
    )
  })
})

void describe("chunked CTC chapters", () => {
  const report = makeReport({
    chapters: [
      {
        ...chapter({
          href: "long.xhtml",
          spineIndex: 4,
          score: 100,
          chapterSentenceCount: 100,
          audioFiles: [{ filepath: "/audio/1.mp3", start: 0, end: 100 }],
        }),
        chunk: 0,
      },
      {
        ...chapter({
          href: "long.xhtml",
          spineIndex: 4,
          score: 60,
          chapterSentenceCount: 300,
          alignedSentenceCount: 200,
          audioFiles: [{ filepath: "/audio/1.mp3", start: 100, end: 400 }],
        }),
        chunk: 1,
      },
    ],
    audioFiles: [audioFile("/audio/1.mp3", 400, 400)],
  })

  void it("collapses chunk rows into one chapter with a weighted score", () => {
    const { items } = buildReportModel({ report })
    const [item] = chapterItems(items)
    assert.strictEqual(items.length, 1)
    assert.strictEqual(item?.confidence, 70)
    assert.strictEqual(item.chapterSentenceCount, 400)
    assert.strictEqual(item.alignedSentenceCount, 300)
  })

  void it("merges the audio spans of the collapsed chunks", () => {
    const { items, audioFiles } = buildReportModel({ report })
    const [item] = chapterItems(items)
    assert.deepStrictEqual(
      item?.audio.map((audio) => [audio.start, audio.end]),
      [[0, 400]],
    )
    assert.strictEqual(audioFiles[0]?.chunks.length, 1)
  })

  void it("lists a chapter whose chunks were all missed once", () => {
    const missed = makeReport({
      chapters: [],
      unalignedChapters: [
        notFound("notes.xhtml", 9, 40),
        notFound("notes.xhtml", 9, 60),
      ],
    })
    const { items } = buildReportModel({ report: missed })
    assert.strictEqual(items.length, 1)
    assert.strictEqual(unalignedItems(items)[0]?.chapterSentenceCount, 100)
  })

  void it("folds a missed chunk into its found chapter", () => {
    const mixed = makeReport({
      chapters: report.chapters,
      unalignedChapters: [notFound("long.xhtml", 4, 50)],
      audioFiles: report.audioFiles,
    })
    const { items } = buildReportModel({ report: mixed })
    assert.strictEqual(items.length, 1)
    assert.strictEqual(chapterItems(items)[0]?.chapterSentenceCount, 450)
    assert.strictEqual(chapterItems(items)[0]?.alignedSentenceCount, 300)
  })
})

void describe("summarizeReport", () => {
  void it("fills the stored summary columns from the model", () => {
    const summary = summarizeReport(
      makeReport({
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
        audioFiles: [audioFile("/audio/1.mp3", 600, 600)],
        unalignedAudioFiles: [{ filepath: "/audio/2.mp3", duration: 60 }],
      }),
      { unalignedChapters: { "d.xhtml": { judgment: "excluded" } } },
    )
    assert.strictEqual(summary.chapters, 2)
    assert.strictEqual(summary.missingSentences, 80)
    assert.strictEqual(summary.mutedChapters, 1)
    assert.strictEqual(summary.failedChapters, 2)
    assert.strictEqual(summary.unalignedAudio, 1)
    assert.strictEqual(summary.grade, gradeForScore(summary.score).grade)
  })
})
