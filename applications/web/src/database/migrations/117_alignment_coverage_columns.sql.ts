import { summarizeReport } from "@/database/alignmentReports"
import { db } from "@/database/connection"
import { logger } from "@/logging"

export default async function migrate() {
  const rows = await db
    .selectFrom("alignmentReport")
    .select(["uuid", "report", "overrides"])
    .where("report", "is not", null)
    .execute()

  let count = 0
  for (const row of rows) {
    if (!row.report) continue
    try {
      const raw: unknown = row.overrides
      const overrides = (
        typeof raw === "string" ? JSON.parse(raw) : raw
      ) as Parameters<typeof summarizeReport>[1]
      const s = summarizeReport(row.report, overrides)
      await db
        .updateTable("alignmentReport")
        .set({
          confidence: s.confidence,
          sentenceCoverage: s.sentenceCoverage,
          audioCoverage: s.audioCoverage,
        })
        .where("uuid", "=", row.uuid)
        .execute()
      count++
    } catch (err) {
      logger.warn({
        msg: "Could not backfill alignment coverage for report",
        reportUuid: row.uuid,
        err,
      })
    }
  }

  logger.info({ msg: `Backfilled alignment coverage for ${count} reports` })
}
