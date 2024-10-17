import { UUID } from "@/uuid"
import { getDatabase } from "./connection"

export class PositionConflictError extends Error {
  constructor() {
    super("Attempted to write a position older than the current one")
    this.name = "PositionConflictError"
  }
}

export function upsertPosition(
  userUuid: UUID,
  bookUuid: UUID,
  locator: unknown,
  timestamp: number,
) {
  const db = getDatabase()

  const insertStatement = db.prepare<{
    userUuid: UUID
    bookUuid: UUID
    locator: string
    timestamp: number
  }>(`
    INSERT INTO position (user_uuid, book_uuid, locator, timestamp)
    VALUES ($userUuid, $bookUuid, $locator, $timestamp)
  `)

  const updateStatement = db.prepare<{
    userUuid: UUID
    bookUuid: UUID
    locator: string
    timestamp: number
  }>(`
    UPDATE position
    SET locator=$locator, timestamp=$timestamp
    WHERE user_uuid=$userUuid AND book_uuid=$bookUuid
  `)

  const queryStatement = db.prepare<{ userUuid: UUID; bookUuid: UUID }>(`
    SELECT timestamp
    FROM position
    WHERE user_uuid=$userUuid AND book_uuid=$bookUuid
  `)

  const locatorString = JSON.stringify(locator)

  const upsertTransaction = db.transaction(() => {
    const existing = queryStatement.get({
      userUuid,
      bookUuid,
    }) as { timestamp: number } | undefined
    if (!existing) {
      insertStatement.run({
        userUuid,
        bookUuid,
        locator: locatorString,
        timestamp,
      })
      return true
    }
    if (existing.timestamp > timestamp) return false
    updateStatement.run({
      userUuid,
      bookUuid,
      locator: locatorString,
      timestamp,
    })
    return true
  })

  const upserted = upsertTransaction()
  if (!upserted) {
    throw new PositionConflictError()
  }
}

export function getPosition(userUuid: UUID, bookUuid: UUID) {
  const db = getDatabase()
  const statement = db.prepare<{
    userUuid: UUID
    bookUuid: UUID
  }>(`
    SELECT locator, timestamp
    FROM position
    WHERE user_uuid=$userUuid AND book_uuid=$bookUuid
  `)

  const result = statement.get({ userUuid, bookUuid }) as
    | {
        locator: string
        timestamp: number
      }
    | undefined

  return (
    result && {
      userUuid,
      bookUuid,
      locator: JSON.parse(result.locator) as unknown,
      timestamp: result.timestamp,
    }
  )
}
