import assert from "node:assert"
import { describe, it } from "node:test"

import { type Report } from "@storyteller-platform/align"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import {
  createAlignmentReport,
  getAlignmentReportForBook,
  updateAlignmentOverrides,
} from "@/database/alignmentReports"
import { migrateOverrides } from "@/database/migrations/115_alignment_overrides_ignored.sql"
import { type UUID } from "@/uuid"

const makeReport = (): Report =>
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
  }) as unknown as Report

void describe("createAlignmentReport", () => {
  void it("prunes the payload of superseded reports but keeps their summary", async () => {
    using ctx = setupTestDb()
    const [bookUuid] = seedBooks(ctx, [{ title: "Book" }]) as UUID[]

    const first = await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })
    const second = await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })

    const rows = ctx.sqlite
      .prepare(
        `SELECT uuid, report IS NULL AS pruned, grade FROM alignment_report WHERE book_uuid = ?`,
      )
      .all(bookUuid) as { uuid: string; pruned: number; grade: string }[]

    assert.strictEqual(rows.length, 2)
    const firstRow = rows.find((r) => r.uuid === first.uuid)
    const secondRow = rows.find((r) => r.uuid === second.uuid)
    assert.strictEqual(firstRow?.pruned, 1)
    assert.ok(firstRow.grade)
    assert.strictEqual(secondRow?.pruned, 0)
  })

  void it("returns the latest report with its payload intact", async () => {
    using ctx = setupTestDb()
    const [bookUuid] = seedBooks(ctx, [{ title: "Book" }]) as UUID[]

    await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })
    const second = await createAlignmentReport({
      bookUuid: bookUuid!,
      jobUuid: null,
      report: makeReport(),
    })

    const latest = await getAlignmentReportForBook(bookUuid!)
    assert.strictEqual(latest?.uuid, second.uuid)
    assert.ok(latest.report)
  })
})

void describe("updateAlignmentOverrides", () => {
  void it("re-grades the stored summary when a chapter is ignored", async () => {
    using ctx = setupTestDb()
    const [bookUuid] = seedBooks(ctx, [{ title: "Book" }]) as UUID[]

    const created = await createAlignmentReport({
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
      } as unknown as Report,
    })

    assert.strictEqual(created.grade, "F")
    assert.strictEqual(created.score, 58)

    const updated = await updateAlignmentOverrides(created.uuid, {
      chapters: { "ch2.xhtml": { ignored: true } },
    })

    assert.strictEqual(updated.grade, "A")
    assert.strictEqual(updated.score, 96)
    assert.strictEqual(updated.mutedChapters, 0)
    assert.strictEqual(updated.failedChapters, 0)
  })
})

void describe("115_alignment_overrides_ignored", () => {
  void it("folds every old flag into ignored", () => {
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

  void it("leaves already migrated overrides alone", () => {
    const overrides = {
      chapters: { "ch1.xhtml": { ignored: true } },
      unalignedChapters: undefined,
      audioFiles: undefined,
    }

    assert.deepStrictEqual(migrateOverrides(overrides), overrides)
    assert.strictEqual(migrateOverrides(null), null)
  })
})
