import { sql } from "kysely"

import {
  type AlignmentOverrides,
  type AnyReport,
  summarizeReport,
} from "@/database/alignmentReports"
import { db } from "@/database/connection"
import { logger } from "@/logging"

export type LegacyIgnore = {
  ignored?: boolean
  markedOk?: boolean
  excludeFromScore?: boolean
  intended?: boolean
  excluded?: boolean
}

export type LegacyOverrides = {
  chapters?: Record<string, LegacyIgnore>
  unalignedChapters?: Record<string, LegacyIgnore>
  audioFiles?: Record<string, LegacyIgnore>
}

function migrateSection(
  section: Record<string, LegacyIgnore> | undefined,
): Record<string, { ignored: boolean }> | undefined {
  if (!section) return undefined
  const migrated: Record<string, { ignored: boolean }> = {}
  for (const [key, flags] of Object.entries(section)) {
    migrated[key] = {
      ignored: !!(
        flags.ignored ??
        (flags.markedOk ||
          flags.excludeFromScore ||
          flags.intended ||
          flags.excluded)
      ),
    }
  }
  return migrated
}

export function migrateOverrides(
  legacy: LegacyOverrides | null,
): AlignmentOverrides | null {
  if (!legacy) return null
  return {
    chapters: migrateSection(legacy.chapters),
    unalignedChapters: migrateSection(legacy.unalignedChapters),
    audioFiles: migrateSection(legacy.audioFiles),
  }
}

export default async function migrate() {
  const rows = await db
    .selectFrom("alignmentReport")
    .select(["uuid", "overrides", "report"])
    .execute()

  let count = 0
  for (const row of rows) {
    const legacy = row.overrides
      ? typeof row.overrides === "string"
        ? (JSON.parse(row.overrides) as LegacyOverrides)
        : (row.overrides as LegacyOverrides)
      : null

    const overrides = migrateOverrides(legacy)

    if (!row.report) {
      if (!overrides) continue
      await sql`
        UPDATE alignment_report SET overrides = ${JSON.stringify(overrides)}
        WHERE uuid = ${row.uuid}
      `.execute(db)
      count++
      continue
    }

    try {
      const report =
        typeof row.report === "string"
          ? (JSON.parse(row.report) as AnyReport)
          : row.report
      const s = summarizeReport(report, overrides)

      await sql`
        UPDATE alignment_report SET
          overrides = ${overrides ? JSON.stringify(overrides) : null},
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
    } catch (error) {
      logger.warn({
        msg: `Could not re-grade alignment report ${row.uuid}`,
        err: error,
      })
    }
  }

  if (count > 0) {
    logger.info({ msg: `Migrated overrides on ${count} alignment reports` })
  }
}
