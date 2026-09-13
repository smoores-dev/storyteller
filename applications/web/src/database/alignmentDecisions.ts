import { sql } from "kysely"

import {
  type AlignmentDecisions,
  type AudioExclusion,
  type ChapterDecision,
  NO_DECISIONS,
} from "@/alignmentReportView"
import { CHAPTER_DECISIONS } from "@/schemas/v2/alignmentReport"
import type { UUID } from "@/uuid"

import { db } from "./connection"

export type { AlignmentDecisions, AudioExclusion, ChapterDecision }

function isChapterDecision(value: string): value is ChapterDecision {
  return (CHAPTER_DECISIONS as readonly string[]).includes(value)
}

export async function getAlignmentDecisions(
  bookUuid: UUID,
): Promise<AlignmentDecisions> {
  const rows = await db
    .selectFrom("alignmentDecision")
    .select(["kind", "key", "startSeconds", "endSeconds", "decision"])
    .where("bookUuid", "=", bookUuid)
    .orderBy("createdAt", "asc")
    .orderBy(sql`rowid`, "asc")
    .execute()

  const chapters: Record<string, ChapterDecision> = {}
  const audio: AudioExclusion[] = []
  for (const row of rows) {
    if (row.kind === "chapter") {
      if (isChapterDecision(row.decision)) chapters[row.key] = row.decision
    } else {
      audio.push({
        track: row.key,
        start: row.startSeconds,
        end: row.endSeconds,
      })
    }
  }
  return { chapters, audio }
}

export async function replaceAlignmentDecisions(
  bookUuid: UUID,
  decisions: AlignmentDecisions,
): Promise<AlignmentDecisions> {
  const clean: AlignmentDecisions = {
    chapters: Object.fromEntries(
      Object.entries(decisions.chapters).filter(([, decision]) =>
        isChapterDecision(decision),
      ),
    ),
    audio: decisions.audio.filter(
      (exclusion) =>
        exclusion.track.length > 0 &&
        (exclusion.start === null ||
          exclusion.end === null ||
          exclusion.end > exclusion.start),
    ),
  }

  await db.transaction().execute(async (tr) => {
    await tr
      .deleteFrom("alignmentDecision")
      .where("bookUuid", "=", bookUuid)
      .execute()

    const values = [
      ...Object.entries(clean.chapters).map(([key, decision]) => ({
        bookUuid,
        kind: "chapter" as const,
        key,
        startSeconds: null,
        endSeconds: null,
        decision,
      })),
      ...clean.audio.map((exclusion) => ({
        bookUuid,
        kind: "audio" as const,
        key: exclusion.track,
        startSeconds: exclusion.start,
        endSeconds: exclusion.end,
        decision: "excluded" as const,
      })),
    ]
    if (values.length > 0) {
      await tr.insertInto("alignmentDecision").values(values).execute()
    }
  })

  return clean
}

export { NO_DECISIONS }
