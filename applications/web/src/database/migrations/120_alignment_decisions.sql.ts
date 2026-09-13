import { sql } from "kysely"

import {
  type AlignmentOverrides,
  overridesToDecisions,
} from "@/alignmentReportView"
import { replaceAlignmentDecisions } from "@/database/alignmentDecisions"
import { resummarizeLatestReport } from "@/database/alignmentReports"
import { db } from "@/database/connection"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

export default async function migrate() {
  const rows = await sql<{
    bookUuid: UUID
    overrides: string | null
  }>`
    select book_uuid as "bookUuid", overrides
    from (
      select book_uuid, overrides,
             row_number() over (partition by book_uuid order by created_at desc, rowid desc) as rn
      from alignment_report
      where book_uuid is not null
    )
    where rn = 1 and overrides is not null
  `.execute(db)

  let count = 0
  for (const row of rows.rows) {
    try {
      const overrides = JSON.parse(
        row.overrides ?? "null",
      ) as AlignmentOverrides | null
      const decisions = overridesToDecisions(overrides)
      if (
        Object.keys(decisions.chapters).length === 0 &&
        decisions.audio.length === 0
      ) {
        continue
      }
      await replaceAlignmentDecisions(row.bookUuid, decisions)
      await resummarizeLatestReport(row.bookUuid)
      count++
    } catch (err) {
      logger.warn({
        msg: "Could not migrate alignment overrides to decisions",
        bookUuid: row.bookUuid,
        err,
      })
    }
  }

  logger.info({ msg: `Migrated alignment overrides for ${count} books` })
}
