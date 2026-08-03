import assert from "node:assert"
import { describe, it } from "node:test"

import { type Report } from "@storyteller-platform/align"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import {
  createAlignmentReport,
  getAlignmentReportForBook,
} from "@/database/alignmentReports"
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
