import assert from "node:assert"
import { describe, it } from "node:test"

import { buildReportView } from "@/alignmentReportView"
import { type AnyReport, summarizeReport } from "@/database/alignmentReports"
import { type UUID } from "@/uuid"

const context = (matchedSentence: string) => ({
  prevSentence: null,
  matchedSentence,
  nextSentence: null,
})

const ctcReport = (): AnyReport =>
  ({
    chapters: [
      {
        href: "ch1.xhtml",
        spineIndex: 0,
        chunk: 0,
        score: 0.9,
        transcriptionOffset: 0,
        endTranscriptionOffset: 100,
        firstMatchedSentenceId: 2,
        firstMatchedSentenceContext: context("first of chunk one"),
        lastMatchedSentenceId: 9,
        lastMatchedSentenceContext: context("last of chunk one"),
        chapterSentenceCount: 10,
        alignedSentenceCount: 8,
        audioFiles: [{ filepath: "a.mp3", start: 0, end: 60 }],
      },
      {
        href: "ch1.xhtml",
        spineIndex: 0,
        chunk: 1,
        score: 0.8,
        transcriptionOffset: 100,
        endTranscriptionOffset: 220,
        firstMatchedSentenceId: 10,
        firstMatchedSentenceContext: context("first of chunk two"),
        lastMatchedSentenceId: 18,
        lastMatchedSentenceContext: context("last of chunk two"),
        chapterSentenceCount: 10,
        alignedSentenceCount: 9,
        audioFiles: [
          { filepath: "a.mp3", start: 60, end: 90 },
          { filepath: "b.mp3", start: 0, end: 30 },
        ],
      },
    ],
    unalignedChapters: [{ href: "nav.xhtml", reason: "is-nav" }],
    audioFiles: [
      {
        filepath: "a.mp3",
        matchedRanges: [{ start: 0, end: 90 }],
        duration: 100,
        alignedDuration: 90,
      },
    ],
    unalignedAudioFiles: [{ filepath: "c.mp3" }],
  }) as unknown as AnyReport

const buildCtcView = () =>
  buildReportView({
    report: ctcReport(),
    bookUuid: "00000000-0000-4000-8000-000000000001" as UUID,
    bookTitle: "Book",
    reportUuid: "00000000-0000-4000-8000-000000000002" as UUID,
    jobUuid: null,
    createdAt: "2026-01-01T00:00:00",
    summary: {
      grade: "A",
      score: 85,
      chapters: 1,
      missingSentences: 3,
      mutedChapters: 0,
      failedChapters: 0,
      unalignedAudio: 1,
    },
    ebookManifest: null,
    audiobookManifest: null,
  })

void describe("buildReportView with a CTC report", () => {
  void it("collapses chunk rows for one href into a single chapter", () => {
    const view = buildCtcView()

    assert.strictEqual(view.chapters.length, 1)
    const chapter = view.chapters[0]
    assert.ok(chapter)
    assert.strictEqual(chapter.href, "ch1.xhtml")
    assert.strictEqual(chapter.chapterSentenceCount, 20)
    assert.strictEqual(chapter.alignedSentenceCount, 17)
    assert.strictEqual(chapter.firstMatchedSentenceId, 2)
    assert.strictEqual(chapter.lastMatchedSentenceId, 18)
    assert.strictEqual(chapter.delta, 3)
  })

  void it("merges the audio spans of the collapsed chunks", () => {
    const chapter = buildCtcView().chapters[0]
    assert.ok(chapter)

    assert.deepStrictEqual(
      chapter.audioFiles.map(({ filepath, start, end }) => ({
        filepath,
        start,
        end,
      })),
      [
        { filepath: "a.mp3", start: 0, end: 90 },
        { filepath: "b.mp3", start: 0, end: 30 },
      ],
    )
  })

  void it("leaves the transcription context off rows that have none", () => {
    const chapter = buildCtcView().chapters[0]
    assert.ok(chapter)

    assert.strictEqual(chapter.transcriptionContext, undefined)
    assert.strictEqual(chapter.endTranscriptionContext, undefined)
    assert.strictEqual(
      chapter.lastMatchedSentenceContext.matchedSentence,
      "last of chunk two",
    )
  })

  void it("keeps unaligned audio files that carry no transcription", () => {
    const view = buildCtcView()

    assert.deepStrictEqual(
      view.unalignedAudioFiles.map((uaf) => ({
        filepath: uaf.filepath,
        duration: uaf.duration,
        transcription: uaf.transcription,
      })),
      [{ filepath: "c.mp3", duration: null, transcription: null }],
    )
  })
})

void describe("summarizeReport with a CTC report", () => {
  void it("counts collapsed chunks as one chapter", () => {
    const summary = summarizeReport(ctcReport())

    assert.strictEqual(summary.chapters, 1)
    assert.strictEqual(summary.missingSentences, 3)
    assert.strictEqual(summary.score, 85)
  })

  void it("does not count a chunk with no matches as a failed chapter", () => {
    const report = ctcReport()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    report.chapters[0]!.alignedSentenceCount = 0

    assert.strictEqual(summarizeReport(report).failedChapters, 0)
  })
})
