import { UUID } from "@/uuid"
import { getDatabase } from "./connection"

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
  userUuid: UUID,
  bookUuid: UUID,
  locator: ReadiumLocator,
  timestamp: number,
) {
  const db = getDatabase()

  const locatorString = JSON.stringify(locator)

  const upserted = await db.transaction().execute(async (tr) => {
    const existing = await tr
      .selectFrom("position")
      .select(["timestamp"])
      .where("userUuid", "=", bookUuid)
      .executeTakeFirst()

    if (!existing) {
      await db
        .insertInto("position")
        .values({ userUuid, bookUuid, locator: locatorString, timestamp })
        .execute()

      return true
    }

    if (existing.timestamp > timestamp) return false

    await db
      .updateTable("position")
      .set({ locator: locatorString, timestamp })
      .where("userUuid", "=", userUuid)
      .where("bookUuid", "=", bookUuid)
      .execute()

    return true
  })

  if (!upserted) {
    throw new PositionConflictError()
  }
}

export async function getPosition(userUuid: UUID, bookUuid: UUID) {
  const db = getDatabase()

  const result = await db
    .selectFrom("position")
    .select(["locator", "timestamp"])
    .where("userUuid", "=", userUuid)
    .where("bookUuid", "=", bookUuid)
    .executeTakeFirst()

  return (
    result && {
      userUuid,
      bookUuid,
      locator: JSON.parse(result.locator) as ReadiumLocator,
      timestamp: result.timestamp,
    }
  )
}
