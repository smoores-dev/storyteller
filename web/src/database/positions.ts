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
    const existing = await tr
      .selectFrom("position")
      .select(["timestamp"])
      .where("userId", "=", bookUuid)
      .executeTakeFirst()

    if (!existing) {
      await db
        .insertInto("position")
        .values({ userId, bookUuid, locator: locatorString, timestamp })
        .execute()

      return true
    }

    if (existing.timestamp > timestamp) return false

    await db
      .updateTable("position")
      .set({ locator: locatorString, timestamp })
      .where("userId", "=", userId)
      .where("bookUuid", "=", bookUuid)
      .execute()

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
      locator: JSON.parse(result.locator) as ReadiumLocator,
      timestamp: result.timestamp,
    }
  )
}
