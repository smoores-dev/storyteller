import assert from "node:assert"

import { describe, it } from "vitest"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import {
  type LegacyReport,
  applyAlignmentOverrides,
  createAlignmentReport,
  getAlignmentReportForBook,
} from "@/database/alignmentReports"
import { migrateOverrides } from "@/database/migrations/115_alignment_overrides_ignored.sql"
import { type UUID } from "@/uuid"

const makeReport = (): LegacyReport =>
  ({
    chapters: [
      {
        href: "ch1.xhtml",
        chapterSentenceCount: 10,
        alignedSentenceCount: 10,
        audioFiles: ["a.mp3"],
      },
    ],
    unalignedChapters: [],
    audioFiles: [],
    unalignedAudioFiles: [],
  }) as unknown as LegacyReport

describe("createAlignmentReport", () => {
  it("prunes the payload of superseded reports but keeps their summary", async () => {
    using ctx = setupTestDb()
    const [bookUuid] = seedBooks(ctx, [{ title: "Book" }]) as UUID[]

    const { report: first } = await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })
    const { report: second } = await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })
    const { report: third } = await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })

    const rows = ctx.sqlite
      .prepare(
        `SELECT uuid, report IS NULL AS pruned, grade FROM alignment_report WHERE book_uuid = ?`,
      )
      .all(bookUuid) as { uuid: string; pruned: number; grade: string }[]

    assert.strictEqual(rows.length, 3)
    const firstRow = rows.find((r) => r.uuid === first.uuid)
    const secondRow = rows.find((r) => r.uuid === second.uuid)
    const thirdRow = rows.find((r) => r.uuid === third.uuid)
    assert.strictEqual(firstRow?.pruned, 1)
    assert.ok(firstRow.grade)
    assert.strictEqual(secondRow?.pruned, 0)
    assert.strictEqual(thirdRow?.pruned, 0)
  })

  it("returns the latest report with its payload intact", async () => {
    using ctx = setupTestDb()
    const [bookUuid] = seedBooks(ctx, [{ title: "Book" }]) as UUID[]

    await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })
    const { report: second } = await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })

    const latest = await getAlignmentReportForBook(bookUuid!)
    assert.strictEqual(latest?.uuid, second.uuid)
    assert.ok(latest.report)
  })
})

describe("applyAlignmentOverrides", () => {
  it("re-grades the stored summary when a chapter is ignored", async () => {
    using ctx = setupTestDb()
    const [bookUuid] = seedBooks(ctx, [{ title: "Book" }]) as UUID[]

    const { report: created } = await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: {
        chapters: [
          {
            href: "ch1.xhtml",
            spineIndex: 1,
            score: 96,
            chapterSentenceCount: 100,
            alignedSentenceCount: 100,
            firstMatchedSentenceId: 0,
            lastMatchedSentenceId: 99,
            firstMatchedSentenceContext: {
              prevSentence: null,
              matchedSentence: "first",
              nextSentence: null,
            },
            lastMatchedSentenceContext: {
              prevSentence: null,
              matchedSentence: "last",
              nextSentence: null,
            },
            audioFiles: [{ filepath: "00001.mp3", start: 0, end: 600 }],
          },
          {
            href: "ch2.xhtml",
            spineIndex: 2,
            score: 20,
            chapterSentenceCount: 100,
            alignedSentenceCount: 0,
            firstMatchedSentenceId: 0,
            lastMatchedSentenceId: 0,
            firstMatchedSentenceContext: {
              prevSentence: null,
              matchedSentence: "",
              nextSentence: null,
            },
            lastMatchedSentenceContext: {
              prevSentence: null,
              matchedSentence: "",
              nextSentence: null,
            },
            audioFiles: [],
          },
        ],
        unalignedChapters: [],
        audioFiles: [],
        unalignedAudioFiles: [],
      },
    })

    assert.strictEqual(created.grade, "B")
    assert.strictEqual(created.score, 65)
    assert.strictEqual(created.confidence, 58)
    assert.strictEqual(created.sentenceCoverage, 50)
    assert.strictEqual(created.audioCoverage, 100)

    const decisions = await applyAlignmentOverrides(bookUuid!, {
      chapters: { "ch2.xhtml": { ignored: true } },
    })
    assert.deepStrictEqual(decisions, {
      chapters: { "ch2.xhtml": "excluded" },
      audio: [],
    })

    const updated = await getAlignmentReportForBook(bookUuid!)
    assert.strictEqual(updated?.uuid, created.uuid)
    assert.strictEqual(updated.grade, "S")
    assert.strictEqual(updated.score, 100)
    assert.strictEqual(updated.confidence, 96)
    assert.strictEqual(updated.sentenceCoverage, 100)
    assert.strictEqual(updated.mutedChapters, 0)
    assert.strictEqual(updated.failedChapters, 0)
  })
})

describe("115_alignment_overrides_ignored", () => {
  it("folds every old flag into ignored", () => {
    assert.deepStrictEqual(
      migrateOverrides({
        chapters: {
          "ch1.xhtml": { markedOk: true },
          "ch2.xhtml": { excludeFromScore: true },
          "ch3.xhtml": { markedOk: false, excludeFromScore: false },
        },
        unalignedChapters: { "ch4.xhtml": { intended: true } },
        audioFiles: { "00001.mp3": { excluded: true } },
      }),
      {
        chapters: {
          "ch1.xhtml": { ignored: true },
          "ch2.xhtml": { ignored: true },
          "ch3.xhtml": { ignored: false },
        },
        unalignedChapters: { "ch4.xhtml": { ignored: true } },
        audioFiles: { "00001.mp3": { ignored: true } },
      },
    )
  })

  it("leaves already migrated overrides alone", () => {
    const overrides = {
      chapters: { "ch1.xhtml": { ignored: true } },
      unalignedChapters: undefined,
      audioFiles: undefined,
    }

    assert.deepStrictEqual(migrateOverrides(overrides), overrides)
    assert.strictEqual(migrateOverrides(null), null)
  })
})
