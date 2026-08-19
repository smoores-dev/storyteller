import { readFile } from "node:fs/promises"

import { sql } from "kysely"

import {
  getAlignmentReportFilepath,
  getTranscriptionFilename,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import {
  type Report,
  createAlignmentReport,
  summarizeReport,
} from "@/database/alignmentReports"
import { type Book } from "@/database/books"
import { db } from "@/database/connection"
import { logger } from "@/logging"

export default async function migrate() {
  await db.transaction().execute(async (trx) => {
    await sql`
      CREATE TABLE IF NOT EXISTS alignment_report (
        uuid TEXT PRIMARY KEY NOT NULL DEFAULT (uuid ()),
        job_uuid TEXT REFERENCES job (uuid) ON DELETE SET NULL,
        book_uuid TEXT REFERENCES book (uuid) ON DELETE CASCADE,
        report TEXT NOT NULL,
        grade TEXT,
        score REAL,
        chapters INTEGER,
        missing_sentences INTEGER,
        muted_chapters INTEGER,
        failed_chapters INTEGER,
        unaligned_audio INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(trx)

    await sql`
      CREATE INDEX IF NOT EXISTS idx_alignment_report_job ON alignment_report (job_uuid)
    `.execute(trx)

    await sql`
      CREATE INDEX IF NOT EXISTS idx_alignment_report_book ON alignment_report (book_uuid)
    `.execute(trx)
  })

  await backfillReports()
  await backfillSummaries()
  await enrichUnalignedAudio()
  await addSidebarItem()
}

async function backfillReports() {
  logger.info({
    msg: "Backfilling alignment reports. This could take a second.",
  })

  const books = await db
    .selectFrom("book")
    .select(["book.uuid", "book.assetDir", "book.title"])
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .leftJoin("alignmentReport", "alignmentReport.bookUuid", "book.uuid")
    .where("readaloud.missing", "=", false)
    .where("readaloud.status", "=", "ALIGNED")
    .where("alignmentReport.bookUuid", "is", null)
    .execute()

  logger.info({ msg: `Found ${books.length} books to backfill` })
  for (const book of books) {
    let report: Report | null = null
    try {
      const reportText = await readFile(
        getAlignmentReportFilepath(book as Book),
        { encoding: "utf-8" },
      )

      report = JSON.parse(reportText) as Report
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENOENT")) {
        logger.warn({
          msg: `Failed to read alignment report for book ${book.title}. This is expected and not an error, carry on.`,
        })
        continue
      }
      logger.warn({
        msg: `Failed to read alignment report for book ${book.title}. This is expected and not an error.`,
        err: error,
      })
      continue
    }

    try {
      await createAlignmentReport({
        bookUuid: book.uuid,
        report: report,
        jobUuid: null,
      })
      logger.info({ msg: `Backfilled alignment report for book ${book.title}` })
    } catch (error) {
      logger.error({
        msg: `Failed to create alignment report for book ${book.title}`,
        err: error,
      })
    }
  }
}

async function backfillSummaries() {
  const columns = await sql<{ name: string }>`
    PRAGMA table_info (alignment_report)
  `.execute(db)
  const hasGrade = columns.rows.some((r) => r.name === "grade")

  if (!hasGrade) {
    logger.info({
      msg: "Skipping backfillSummaries: summary columns not yet on alignment_report (repair migration will handle it).",
    })
    return
  }

  logger.info({ msg: "Backfilling alignment summaries onto reports." })

  const rows = await db
    .selectFrom("alignmentReport")
    .select(["uuid", "bookUuid", "report"])
    .where("bookUuid", "is not", null)
    .where("grade", "is", null)
    .orderBy("createdAt", "desc")
    .execute()

  let count = 0
  for (const row of rows) {
    if (row.report == null) continue
    const report: Report =
      typeof row.report === "string"
        ? (JSON.parse(row.report) as Report)
        : row.report
    const s = summarizeReport(report)

    await sql`
      UPDATE alignment_report SET
        grade = ${s.grade},
        score = ${s.score},
        chapters = ${s.chapters},
        missing_sentences = ${s.missingSentences},
        muted_chapters = ${s.mutedChapters},
        failed_chapters = ${s.failedChapters},
        unaligned_audio = ${s.unalignedAudio}
      WHERE uuid = ${row.uuid}
    `.execute(db)
    count++
  }

  logger.info({ msg: `Backfilled alignment summaries for ${count} reports` })
}

async function enrichUnalignedAudio() {
  const rows = await db
    .selectFrom("alignmentReport")
    .innerJoin("book", "book.uuid", "alignmentReport.bookUuid")
    .select([
      "alignmentReport.uuid as reportUuid",
      "alignmentReport.report as report",
      "book.uuid as uuid",
      "book.assetDir as assetDir",
      "book.title as title",
    ])
    .execute()

  let enriched = 0
  for (const row of rows) {
    if (row.report == null) continue
    const report: Partial<Report> =
      typeof row.report === "string"
        ? (JSON.parse(row.report) as Report)
        : row.report
    if (report.unalignedAudioFiles?.length === 0) continue

    let changed = false
    for (const uaf of report.unalignedAudioFiles ?? []) {
      if (uaf.transcription) continue
      try {
        const text = await readFile(
          getTranscriptionsFilepath(
            row as unknown as Book,
            getTranscriptionFilename(uaf.filepath),
          ),
          { encoding: "utf-8" },
        )
        const parsed = JSON.parse(text) as { transcript?: string }
        const transcript = parsed.transcript?.trim()
        if (transcript) {
          uaf.transcription = { text: transcript.slice(0, 2000) }
          changed = true
        }
      } catch {}
    }

    if (changed) {
      await db
        .updateTable("alignmentReport")
        .set({ report: JSON.stringify(report) })
        .where("uuid", "=", row.reportUuid)
        .execute()
      enriched++
    }
  }

  logger.info({
    msg: `Enriched unaligned audio transcription for ${enriched} reports`,
  })
}

async function addSidebarItem() {
  await db.transaction().execute(async (trx) => {
    const mainGroups = await sql<{ uuid: string; userId: string }>`
      SELECT uuid, user_id as "userId"
      FROM sidebar_group
      WHERE name = 'library'
    `.execute(trx)

    for (const group of mainGroups.rows) {
      const existing = await sql<{ uuid: string }>`
        SELECT uuid FROM sidebar_item
        WHERE user_id = ${group.userId}
          AND kind = 'builtin'
          AND builtin_key = 'alignment-quality'
      `.execute(trx)

      if (existing.rows.length > 0) continue

      const maxPos = await sql<{ maxPos: number | null }>`
        SELECT MAX(position) as "maxPos"
        FROM sidebar_item
        WHERE group_uuid = ${group.uuid}
      `.execute(trx)

      const nextPos = (maxPos.rows[0]?.maxPos ?? -1) + 1

      await sql`
        INSERT INTO sidebar_item (uuid, user_id, group_uuid, kind, builtin_key, position, hidden)
        VALUES (${crypto.randomUUID()}, ${group.userId}, ${group.uuid}, 'builtin', 'alignment-quality', ${nextPos}, 0)
      `.execute(trx)
    }
  })
}
