import assert from "node:assert"
import { describe, it } from "node:test"

import {
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

const makeReport = (input: {
  chapters: ReturnType<typeof chapter>[]
  unalignedChapters?: unknown[]
  audioFiles?: unknown[]
  unalignedAudioFiles?: unknown[]
}) =>
  ({
    chapters: input.chapters,
    unalignedChapters: input.unalignedChapters ?? [],
    audioFiles: input.audioFiles ?? [],
    unalignedAudioFiles: input.unalignedAudioFiles ?? [],
  }) as unknown as AnyReport

const chapters = (model: ReturnType<typeof buildReportModel>) =>
  model.items.filter(
    (item): item is ReportChapterItem => item.kind === "chapter",
  )

const unaligned = (model: ReturnType<typeof buildReportModel>) =>
  model.items.filter(
    (item): item is ReportUnalignedItem => item.kind === "unaligned",
  )

void describe("gradeForScore", () => {
  void it("maps every band edge to its grade", () => {
    assert.deepStrictEqual(gradeForScore(100), { grade: "A", band: 0 })
    assert.deepStrictEqual(gradeForScore(95), { grade: "A", band: 0 })
    assert.deepStrictEqual(gradeForScore(94.9), { grade: "A-", band: 1 })
    assert.deepStrictEqual(gradeForScore(90), { grade: "A-", band: 1 })
    assert.deepStrictEqual(gradeForScore(89.9), { grade: "B", band: 2 })
    assert.deepStrictEqual(gradeForScore(85), { grade: "B", band: 2 })
    assert.deepStrictEqual(gradeForScore(84.9), { grade: "B-", band: 3 })
    assert.deepStrictEqual(gradeForScore(80), { grade: "B-", band: 3 })
    assert.deepStrictEqual(gradeForScore(79.9), { grade: "C", band: 4 })
    assert.deepStrictEqual(gradeForScore(75), { grade: "C", band: 4 })
    assert.deepStrictEqual(gradeForScore(74.9), { grade: "D", band: 5 })
    assert.deepStrictEqual(gradeForScore(70), { grade: "D", band: 5 })
    assert.deepStrictEqual(gradeForScore(69.9), { grade: "F", band: 6 })
    assert.deepStrictEqual(gradeForScore(0), { grade: "F", band: 6 })
  })

  void it("fails a report with no score at all", () => {
    assert.deepStrictEqual(gradeForScore(null), { grade: "F", band: 6 })
  })
})

void describe("the weighted score", () => {
  const bodyChapters = () => [
    chapter({
      href: "ch1.xhtml",
      spineIndex: 1,
      score: 95.6,
      chapterSentenceCount: 100,
    }),
    chapter({
      href: "ch9.xhtml",
      spineIndex: 9,
      score: 86,
      chapterSentenceCount: 100,
    }),
  ]

  const twoChapters = () => makeReport({ chapters: bodyChapters() })

  void it("weighs each chapter by its sentence count", () => {
    const { summary } = buildReportModel({ report: twoChapters() })

    assert.strictEqual(summary.score, 90.8)
    assert.strictEqual(summary.grade, "A-")
    assert.strictEqual(summary.band, 1)
  })

  void it("counts a not-found body chapter as a zero", () => {
    const report = makeReport({
      chapters: bodyChapters(),
      unalignedChapters: [
        {
          href: "ch5.xhtml",
          spineIndex: 5,
          reason: "not-found",
          score: 0,
          chapterSentenceCount: 40,
          start: "The gate stood open.",
          end: "",
        },
      ],
    })

    const { summary, items } = buildReportModel({ report })

    assert.strictEqual(summary.notFoundBody, 1)
    assert.strictEqual(summary.score, 75.7)
    assert.strictEqual(summary.grade, "C")
    assert.strictEqual(
      items.find((item) => item.href === "ch5.xhtml")?.needsLook,
      true,
    )
  })

  void it("ignores a not-found chapter outside the matched spine range", () => {
    const model = buildReportModel({
      report: makeReport({
        chapters: bodyChapters(),
        unalignedChapters: [
          {
            href: "discover-more.xhtml",
            spineIndex: 12,
            reason: "not-found",
            score: 0,
            chapterSentenceCount: 40,
            start: "Discover your next read.",
            end: "",
          },
        ],
      }),
    })

    assert.strictEqual(model.summary.score, 90.8)
    assert.strictEqual(model.summary.notFoundBody, 0)
    const item = unaligned(model)[0]
    assert.ok(item)
    assert.strictEqual(item.inBody, false)
    assert.strictEqual(item.needsLook, false)
    assert.strictEqual(item.hint, "promo")
  })

  void it("has no score when every chapter is ignored", () => {
    const overrides: AlignmentOverrides = {
      chapters: {
        "ch1.xhtml": { ignored: true },
        "ch9.xhtml": { ignored: true },
      },
    }

    const { summary } = buildReportModel({ report: twoChapters(), overrides })

    assert.strictEqual(summary.score, null)
    assert.strictEqual(summary.grade, "F")
    assert.strictEqual(summary.band, 6)
    assert.strictEqual(summary.ignored, 2)
  })
})

void describe("ignoring", () => {
  const report = () =>
    makeReport({
      chapters: [
        chapter({
          href: "ch1.xhtml",
          spineIndex: 1,
          score: 96,
          chapterSentenceCount: 100,
        }),
        chapter({
          href: "ch2.xhtml",
          spineIndex: 2,
          score: 20,
          chapterSentenceCount: 100,
          alignedSentenceCount: 10,
          audioFiles: [],
        }),
      ],
      unalignedAudioFiles: [{ filepath: "/audio/00099.mp3" }],
    })

  void it("drops an ignored chapter from the score and its warnings", () => {
    const before = buildReportModel({ report: report() })
    assert.strictEqual(before.summary.score, 58)
    assert.strictEqual(before.summary.needsLook, 1)
    assert.strictEqual(before.summary.noAudio, 1)

    const after = buildReportModel({
      report: report(),
      overrides: { chapters: { "ch2.xhtml": { ignored: true } } },
    })

    assert.strictEqual(after.summary.score, 96)
    assert.strictEqual(after.summary.needsLook, 0)
    assert.strictEqual(after.summary.noAudio, 0)
    assert.strictEqual(chapters(after)[1]?.needsLook, false)
    assert.strictEqual(chapters(after)[1]?.ignored, true)
  })

  void it("drops an ignored audio file from the loose count", () => {
    const before = buildReportModel({ report: report() })
    assert.strictEqual(before.summary.looseAudio, 1)

    const after = buildReportModel({
      report: report(),
      overrides: { audioFiles: { "/audio/00099.mp3": { ignored: true } } },
    })

    assert.strictEqual(after.summary.looseAudio, 0)
  })
})

void describe("chapter status", () => {
  void it("flags a chapter whose audio is far too short for its text", () => {
    const { items } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "ch1.xhtml",
            spineIndex: 1,
            score: 96,
            chapterSentenceCount: 30,
            audioFiles: [{ filepath: "/audio/00001.mp3", start: 0, end: 10 }],
          }),
        ],
      }),
    })

    const item = items[0]
    assert.ok(item?.kind === "chapter")
    assert.strictEqual(item.audioSeconds, 10)
    assert.strictEqual(item.durationSuspicious, true)
    assert.strictEqual(item.status, "range")
    assert.strictEqual(item.needsLook, true)
  })

  void it("leaves a chapter with enough audio alone", () => {
    const { items } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "ch1.xhtml",
            spineIndex: 1,
            score: 96,
            chapterSentenceCount: 30,
            audioFiles: [{ filepath: "/audio/00001.mp3", start: 0, end: 20 }],
          }),
        ],
      }),
    })

    const item = items[0]
    assert.ok(item?.kind === "chapter")
    assert.strictEqual(item.durationSuspicious, false)
    assert.strictEqual(item.status, "ok")
    assert.strictEqual(item.needsLook, false)
  })

  void it("calls a chapter with no audio no-audio", () => {
    const { items, summary } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "ch1.xhtml",
            spineIndex: 1,
            score: 96,
            chapterSentenceCount: 30,
            audioFiles: [],
          }),
        ],
      }),
    })

    const item = items[0]
    assert.ok(item?.kind === "chapter")
    assert.strictEqual(item.status, "no-audio")
    assert.strictEqual(summary.noAudio, 1)
  })

  void it("calls a chapter that lost a chunk of sentences missing", () => {
    const { items } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "ch1.xhtml",
            spineIndex: 1,
            score: 88,
            chapterSentenceCount: 100,
            alignedSentenceCount: 80,
          }),
        ],
      }),
    })

    const item = items[0]
    assert.ok(item?.kind === "chapter")
    assert.strictEqual(item.missing, 20)
    assert.strictEqual(item.status, "missing")
  })
})

void describe("item ordering", () => {
  void it("pins spine-index-less items to the top and sorts the rest", () => {
    const { items } = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "ch5.xhtml",
            spineIndex: 5,
            score: 96,
            chapterSentenceCount: 50,
          }),
          chapter({
            href: "ch2.xhtml",
            spineIndex: 2,
            score: 96,
            chapterSentenceCount: 50,
          }),
        ],
        unalignedChapters: [
          { href: "cover.xhtml", reason: "no-text" },
          { href: "toc.xhtml", reason: "is-nav" },
          { href: "ch3.xhtml", spineIndex: 3, reason: "too-short" },
        ],
      }),
    })

    assert.deepStrictEqual(
      items.map((item) => item.href),
      ["cover.xhtml", "toc.xhtml", "ch2.xhtml", "ch3.xhtml", "ch5.xhtml"],
    )
    assert.strictEqual(items[0]?.spineIndex, null)
  })
})

void describe("the audio strip", () => {
  const report = () =>
    makeReport({
      chapters: [
        chapter({
          href: "ch1.xhtml",
          spineIndex: 1,
          score: 96,
          chapterSentenceCount: 50,
          audioFiles: [{ filepath: "/audio/00001.mp3", start: 0, end: 500 }],
        }),
        chapter({
          href: "ch2.xhtml",
          spineIndex: 2,
          score: 86,
          chapterSentenceCount: 50,
          audioFiles: [
            { filepath: "/audio/00001.mp3", start: 500, end: 900 },
            { filepath: "/audio/00003.mp3", start: 0, end: 200 },
          ],
        }),
      ],
      audioFiles: [
        {
          filepath: "/audio/00001.mp3",
          matchedRanges: [{ start: 0, end: 900 }],
          duration: 900,
          alignedDuration: 900,
        },
        {
          filepath: "/audio/00003.mp3",
          matchedRanges: [{ start: 0, end: 200 }],
          duration: 400,
          alignedDuration: 200,
        },
      ],
      unalignedAudioFiles: [{ filepath: "/audio/00002.mp3", duration: 300 }],
    })

  void it("lists every file in filename order with its ranges", () => {
    const { audioFiles } = buildReportModel({ report: report() })

    assert.deepStrictEqual(
      audioFiles.map((file) => file.name),
      ["00001.mp3", "00002.mp3", "00003.mp3"],
    )
    assert.deepStrictEqual(
      audioFiles[0]?.ranges.map((range) => [range.label, range.tone]),
      [
        ["ch1", "good"],
        ["ch2", "moderate"],
      ],
    )
    assert.strictEqual(audioFiles[0].placed, true)
  })

  void it("names the neighbours of an unplaced file", () => {
    const { audioFiles, summary } = buildReportModel({ report: report() })

    const loose = audioFiles[1]
    assert.ok(loose)
    assert.strictEqual(loose.placed, false)
    assert.strictEqual(loose.duration, 300)
    assert.deepStrictEqual(loose.between, { before: "ch2", after: "ch2" })
    assert.strictEqual(summary.looseAudio, 1)
  })

  void it("totals placed and known audio", () => {
    const { summary } = buildReportModel({ report: report() })

    assert.strictEqual(summary.audioPlacedSeconds, 1100)
    assert.strictEqual(summary.audioTotalSeconds, 1600)
  })

  void it("tells a chapter which files it shares", () => {
    const { items } = buildReportModel({ report: report() })

    const second = items[1]
    assert.ok(second?.kind === "chapter")
    assert.deepStrictEqual(
      second.audio.map((audio) => [audio.name, audio.sharedWith.length]),
      [
        ["00001.mp3", 1],
        ["00003.mp3", 0],
      ],
    )
    assert.deepStrictEqual(second.audio[0]?.sharedWith[0], {
      href: "ch1.xhtml",
      label: "ch1",
      role: "before",
    })
  })
})

void describe("labels", () => {
  void it("prefers the manifest title over the href stem", () => {
    const model = buildReportModel({
      report: makeReport({
        chapters: [
          chapter({
            href: "OEBPS/ch1.xhtml",
            spineIndex: 1,
            score: 96,
            chapterSentenceCount: 50,
          }),
        ],
        unalignedChapters: [{ href: "OEBPS/ch2.xhtml", reason: "too-short" }],
      }),
      ebookManifest: {
        toc: [{ href: "ch1.xhtml", title: "One Fine Day" }],
      },
    })

    assert.strictEqual(chapters(model)[0]?.label, "One Fine Day")
    assert.strictEqual(unaligned(model)[0]?.label, "ch2")
  })
})

void describe("chunked CTC chapters", () => {
  const chunked = () => {
    const first = chapter({
      href: "ch1.xhtml",
      spineIndex: 1,
      score: 100,
      chapterSentenceCount: 10,
      alignedSentenceCount: 8,
      audioFiles: [{ filepath: "/audio/00001.mp3", start: 0, end: 60 }],
    })
    const second = chapter({
      href: "ch1.xhtml",
      spineIndex: 1,
      score: 80,
      chapterSentenceCount: 30,
      alignedSentenceCount: 29,
      audioFiles: [
        { filepath: "/audio/00001.mp3", start: 60, end: 90 },
        { filepath: "/audio/00002.mp3", start: 0, end: 30 },
      ],
    })
    return makeReport({ chapters: [first, second] })
  }

  void it("collapses chunk rows into one chapter with a weighted score", () => {
    const { items, summary } = buildReportModel({ report: chunked() })

    assert.strictEqual(summary.chapters, 1)
    const item = items[0]
    assert.ok(item?.kind === "chapter")
    assert.strictEqual(item.chapterSentenceCount, 40)
    assert.strictEqual(item.alignedSentenceCount, 37)
    assert.strictEqual(item.missing, 3)
    assert.strictEqual(item.score, 85)
  })

  void it("merges the audio spans of the collapsed chunks", () => {
    const { items } = buildReportModel({ report: chunked() })

    const item = items[0]
    assert.ok(item?.kind === "chapter")
    assert.deepStrictEqual(
      item.audio.map(({ name, start, end }) => ({ name, start, end })),
      [
        { name: "00001.mp3", start: 0, end: 90 },
        { name: "00002.mp3", start: 0, end: 30 },
      ],
    )
    assert.strictEqual(item.lastMatch.matchedSentence, "ch1.xhtml last")
  })
})

void describe("summarizeReport", () => {
  void it("fills the stored summary columns from the model", () => {
    const summary = summarizeReport(
      makeReport({
        chapters: [
          chapter({
            href: "ch1.xhtml",
            spineIndex: 1,
            score: 96,
            chapterSentenceCount: 100,
            alignedSentenceCount: 90,
          }),
          chapter({
            href: "ch2.xhtml",
            spineIndex: 2,
            score: 40,
            chapterSentenceCount: 100,
            alignedSentenceCount: 0,
            audioFiles: [],
          }),
        ],
        unalignedAudioFiles: [{ filepath: "/audio/00099.mp3" }],
      }),
    )

    assert.strictEqual(summary.grade, "F")
    assert.strictEqual(summary.band, 6)
    assert.strictEqual(summary.score, 68)
    assert.strictEqual(summary.chapters, 2)
    assert.strictEqual(summary.missingSentences, 110)
    assert.strictEqual(summary.mutedChapters, 1)
    assert.strictEqual(summary.failedChapters, 1)
    assert.strictEqual(summary.unalignedAudio, 1)
  })
})
