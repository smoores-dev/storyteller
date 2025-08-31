import { UUID } from "@/uuid"
import { db } from "./connection"

export type ReadiumLocation = {
  fragments?: string[]
  progression?: number
  position?: number
  totalProgression?: number
  cssSelector?: string
  partialCfi?: string
  domRange?: {
    start: {
      cssSelector: string
      textNodeIndex: number
      charOffset?: number
    }
    end?: {
      cssSelector: string
      textNodeIndex: number
      charOffset?: number
    }
  }
}

export type ReadiumLocator = {
  href: string
  type: string
  title?: string
  locations?: ReadiumLocation
  text?: {
    after?: string
    before?: string
    highlight?: string
  }
}

export type Position = {
  locator: ReadiumLocator
  timestamp: number
}

export class PositionConflictError extends Error {
  constructor() {
    super("Attempted to write a position older than the current one")
    this.name = "PositionConflictError"
  }
}

export async function upsertPosition(
  userId: UUID,
  bookUuid: UUID,
  locator: ReadiumLocator,
  timestamp: number,
) {
  const locatorString = JSON.stringify(locator)

  const upserted = await db.transaction().execute(async (tr) => {
    const { statusUuid } = await tr
      .selectFrom("bookToStatus")
      .select(["statusUuid"])
      .where("bookUuid", "=", bookUuid)
      .executeTakeFirstOrThrow()

    const existing = await tr
      .selectFrom("position")
      .select(["timestamp"])
      .where("userId", "=", userId)
      .where("bookUuid", "=", bookUuid)
      .executeTakeFirst()

    if (!existing) {
      await tr
        .insertInto("position")
        .values({ userId, bookUuid, locator: locatorString, timestamp })
        .execute()
    } else {
      if (existing.timestamp > timestamp) return false

      await tr
        .updateTable("position")
        .set({ locator: locatorString, timestamp })
        .where("userId", "=", userId)
        .where("bookUuid", "=", bookUuid)
        .execute()
    }

    const statuses = await tr.selectFrom("status").selectAll().execute()
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const toRead = statuses.find((status) => status.name === "To read")!
    const reading = statuses.find((status) => status.name === "Reading")!
    const read = statuses.find((status) => status.name === "Read")!
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    if (
      statusUuid === toRead.uuid &&
      (locator.locations?.totalProgression ?? 0) < 0.98
    ) {
      await tr
        .updateTable("bookToStatus")
        .set({ statusUuid: reading.uuid })
        .where("bookToStatus.bookUuid", "=", bookUuid)
        .where("bookToStatus.userId", "=", userId)
        .execute()
    }
    if (
      statusUuid === toRead.uuid ||
      (statusUuid === reading.uuid &&
        (locator.locations?.totalProgression ?? 0) >= 0.98)
    ) {
      await tr
        .updateTable("bookToStatus")
        .set({ statusUuid: read.uuid })
        .where("bookToStatus.bookUuid", "=", bookUuid)
        .where("bookToStatus.userId", "=", userId)
        .execute()
    }

    return true
  })

  if (!upserted) {
    throw new PositionConflictError()
  }
}

export async function getPosition(userId: UUID, bookUuid: UUID) {
  const result = await db
    .selectFrom("position")
    .select(["locator", "timestamp"])
    .where("userId", "=", userId)
    .where("bookUuid", "=", bookUuid)
    .executeTakeFirst()

  return (
    result && {
      userId,
      bookUuid,
      // This seems to be automatically parsed by kysely?
      locator: result.locator as unknown as ReadiumLocator,
      timestamp: result.timestamp,
    }
  )
}
