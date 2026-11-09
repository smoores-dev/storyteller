import { describe, expect, it } from "vitest"

import { type TestDbContext, setupTestDb } from "@/__tests__/harness/testDb"
import { pruneEventLogs, runEventLogPruning } from "@/eventLogPruning"

const FLOOR = 50_000

function insertEvents(ctx: TestDbContext, count: number, daysOld?: number) {
  const aged =
    daysOld === undefined ? "" : `, datetime('now', '-${daysOld} days')`

  ctx.sqlite.exec(`
    insert into event_log (table_name, uuid, op${aged ? ", created_at" : ""})
    with recursive c (i) as (select 1 union all select i + 1 from c where i < ${count})
    select 'creator', hex(randomblob(16)), 'u'${aged} from c
  `)
}

function countWhere(ctx: TestDbContext, where: string) {
  const row = ctx.sqlite
    .prepare(`select count(*) n from event_log where ${where}`)
    .get() as { n: number }
  return row.n
}

const count = (ctx: TestDbContext) => {
  const row = ctx.sqlite.prepare("select count(*) n from event_log").get() as {
    n: number
  }
  return row.n
}

function bounds(ctx: TestDbContext) {
  return ctx.sqlite
    .prepare("select min(seq) lo, max(seq) hi, count(*) n from event_log")
    .get() as { lo: number; hi: number; n: number }
}

function clearLog(ctx: TestDbContext) {
  ctx.sqlite.exec("delete from event_log")
}

describe("pruneEventLogs", () => {
  it("keeps everything while the log is shorter than the floor", async () => {
    using ctx = setupTestDb()
    clearLog(ctx)
    insertEvents(ctx, 10, 400)

    await pruneEventLogs()

    expect(count(ctx)).toBe(10)
  })

  it("trims back down to the floor when every event is expired", async () => {
    using ctx = setupTestDb()
    clearLog(ctx)
    insertEvents(ctx, FLOOR + 200, 60)

    await pruneEventLogs()

    expect(count(ctx)).toBe(FLOOR)
  })

  it("keeps the newest contiguous run of events", async () => {
    using ctx = setupTestDb()
    clearLog(ctx)
    insertEvents(ctx, FLOOR + 200, 60)
    const newest = bounds(ctx).hi

    await pruneEventLogs()

    const { lo, hi, n } = bounds(ctx)
    expect(hi).toBe(newest)
    expect(hi - lo + 1).toBe(n)
  })

  it("never deletes an event that is not expired", async () => {
    using ctx = setupTestDb()
    clearLog(ctx)
    insertEvents(ctx, FLOOR + 500, 45)
    insertEvents(ctx, 500)

    await pruneEventLogs()

    expect(countWhere(ctx, "created_at >= datetime('now', '-30 days')")).toBe(
      500,
    )
    expect(count(ctx)).toBe(FLOOR)
  })

  it("keeps everything when nothing is expired", async () => {
    using ctx = setupTestDb()
    clearLog(ctx)
    insertEvents(ctx, FLOOR + 100)

    await pruneEventLogs()

    expect(count(ctx)).toBe(FLOOR + 100)
  })

  it("does nothing on an empty log", async () => {
    using ctx = setupTestDb()
    clearLog(ctx)

    await pruneEventLogs()

    expect(count(ctx)).toBe(0)
  })
})

describe("runEventLogPruning", () => {
  it("swallows pruning failures", async () => {
    using ctx = setupTestDb()
    ctx.sqlite.exec("drop table event_log")

    await expect(runEventLogPruning()).resolves.toBeUndefined()
  })
})
