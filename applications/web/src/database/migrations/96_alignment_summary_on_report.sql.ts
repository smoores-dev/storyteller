import { readFile } from "fs/promises"

import { sql } from "kysely"

import { getAlignmentReportFilepath } from "@/assets/paths"
import { type Report, createAlignmentReport } from "@/database/alignmentReports"
import { type Book } from "@/database/books"
import { db } from "@/database/connection"
import { logger } from "@/logging"

const REPORT_SUMMARY_COLUMNS: Array<[name: string, type: string]> = [
  ["grade", "TEXT"],
  ["score", "REAL"],
  ["chapters", "INTEGER"],
  ["missing_sentences", "INTEGER"],
  ["muted_chapters", "INTEGER"],
  ["failed_chapters", "INTEGER"],
  ["unaligned_audio", "INTEGER"],
]

const BOOK_ALIGNMENT_COLUMNS = [
  "alignment_grade",
  "alignment_score",
  "alignment_chapters",
  "alignment_missing_sentences",
  "alignment_muted_chapters",
  "alignment_failed_chapters",
  "alignment_unaligned_audio",
  "alignment_report_uuid",
]

export default async function migrate() {
  await addColumnsToReport()
  await backfillSummaries()
  await dropColumnsFromBook()
}

async function addColumnsToReport() {
  const columns = await sql<{ name: string }>`
    PRAGMA table_info (alignment_report)
  `.execute(db)
  const existing = new Set(columns.rows.map((r) => r.name))

  for (const [name, type] of REPORT_SUMMARY_COLUMNS) {
    if (existing.has(name)) continue

    await sql`
      ALTER TABLE alignment_report ADD COLUMN ${sql.raw(name)} ${sql.raw(type)}
    `.execute(db)
  }
}

async function backfillSummaries() {
  const rows = await db
    .selectFrom("book")
    .select(["book.uuid", "book.assetDir", "book.title"])
    .innerJoin("readaloud", "readaloud.bookUuid", "book.uuid")
    .leftJoin("alignmentReport", "alignmentReport.bookUuid", "book.uuid")
    .where("alignmentReport.bookUuid", "is", null)
    .where("grade", "is", null)
    .execute()

  if (rows.length === 0) return

  logger.info({
    msg: `Backfilling alignment summaries for ${rows.length} reports`,
  })

  let count = 0
  for (const row of rows) {
    let report: Report | null = null
    try {
      const reportText = await readFile(
        getAlignmentReportFilepath(row as Book),
        { encoding: "utf-8" },
      )

      report = JSON.parse(reportText) as Report
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENOENT")) {
        logger.warn({
          msg: `Failed to read alignment report for book ${row.title}. This is expected and not an error, carry on.`,
        })
        continue
      }
      logger.warn({
        msg: `Failed to read alignment report for book ${row.title}. This may be expected.`,
        err: error,
      })
      continue
    }

    try {
      await createAlignmentReport({
        bookUuid: row.uuid,
        report: report,
        jobUuid: null,
      })
      logger.info({ msg: `Backfilled alignment report for book ${row.title}` })
    } catch (error) {
      logger.error({
        msg: `Failed to create alignment report for book ${row.title}`,
        err: error,
      })
    }
    count++
  }

  logger.info({ msg: `Backfilled alignment summaries for ${count} reports` })
}

async function dropColumnsFromBook() {
  const columns = await sql<{ name: string }>`
    PRAGMA table_info (book)
  `.execute(db)
  const existing = new Set(columns.rows.map((r) => r.name))

  for (const name of BOOK_ALIGNMENT_COLUMNS) {
    if (!existing.has(name)) continue

    await sql`
      ALTER TABLE book DROP COLUMN ${sql.raw(name)}
    `.execute(db)
  }
}
