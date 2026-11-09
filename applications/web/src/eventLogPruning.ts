import { sql } from "kysely"

import { logger } from "@/logging"

import { db } from "./database/connection"

const DAY_MS = 24 * 60 * 60 * 1000

export async function pruneEventLogs() {
  const cut = await db
    .selectFrom("eventLog")
    .select("seq")
    .where("createdAt", "<", sql<string>`datetime('now', '-30 days')`)
    .where("seq", "<=", (eb) =>
      eb
        .selectFrom("eventLog")
        .select(["seq"])
        .orderBy("seq", "desc")
        .limit(1)
        .offset(50_000),
    )
    .orderBy("seq", "desc")
    .limit(1)
    .executeTakeFirst()
    .then((row) => row?.seq)

  if (!cut) return

  let changes!: bigint
  do {
    const result = await db
      .deleteFrom("eventLog")
      .where("seq", "in", (eb) =>
        eb
          .selectFrom("eventLog")
          .select(["seq"])
          .where("seq", "<=", cut)
          .orderBy("seq")
          .limit(5_000),
      )
      .executeTakeFirst()
    changes = result.numDeletedRows
  } while (changes > 0n)
}

export async function runEventLogPruning() {
  try {
    await pruneEventLogs()
  } catch (err) {
    logger.error({ err }, "Event log pruning failed")
  }
}

export function startEventLogPruning() {
  void runEventLogPruning()
  setInterval(() => void runEventLogPruning(), DAY_MS).unref()
}
