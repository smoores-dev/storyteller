import { isDeepStrictEqual } from "node:util"

import { logger } from "@/logging"
import { type UUID } from "@/uuid"

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
  overwriteOnEqual = false,
) {
  logger.debug("upsertPosition(...)")
  logger.debug("Incoming position")
  logger.debug({
    userId,
    bookUuid,
    locator,
    positionTimestamp: timestamp,
  })
  const locatorString = JSON.stringify(locator)

  const upserted = await db.transaction().execute(async (tr) => {
    const { statusUuid } = await tr
      .selectFrom("bookToStatus")
      .select(["statusUuid"])
      .where("bookUuid", "=", bookUuid)
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow()

    logger.debug({
      statusUuid,
    })

    const existing = await tr
      .selectFrom("position")
      .select(["timestamp", "locator"])
      .where("userId", "=", userId)
      .where("bookUuid", "=", bookUuid)
      .executeTakeFirst()

    logger.debug("Existing position")
    logger.debug({ ...existing, positionTimestamp: timestamp })

    if (!existing) {
      await tr
        .insertInto("position")
        .values({ userId, bookUuid, locator: locatorString, timestamp })
        .execute()

      logger.debug("No existing position, created new row")
    } else {
      if (existing.timestamp > timestamp) {
        logger.debug(
          "Existing position is newer than incoming position, aborting",
        )
        return false
      }

      if (
        existing.timestamp === timestamp &&
        !isDeepStrictEqual(existing.locator, locator) &&
        !overwriteOnEqual
      ) {
        logger.debug(
          "Existing position has same timestamp as incoming position, but locator is different, aborting",
        )
        return false
      }

      if (
        existing.timestamp === timestamp &&
        isDeepStrictEqual(existing.locator, locator) &&
        !overwriteOnEqual
      ) {
        logger.debug(
          "Existing position has same timestamp as incoming, with same locator, doing nothing",
        )
        return true
      }

      logger.debug(
        "Incoming position has newer timestamp than existing position, updating",
      )

      await tr
        .updateTable("position")
        .set({ locator: locatorString, timestamp })
        .where("userId", "=", userId)
        .where("bookUuid", "=", bookUuid)
        .execute()

      logger.debug("Updated existing position")
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
      logger.debug(
        'Status is "To read" and progression is less than 98%, setting to "Reading"',
      )
      await tr
        .updateTable("bookToStatus")
        .set({ statusUuid: reading.uuid })
        .where("bookToStatus.bookUuid", "=", bookUuid)
        .where("bookToStatus.userId", "=", userId)
        .execute()
    }
    if (
      (statusUuid === toRead.uuid || statusUuid === reading.uuid) &&
      (locator.locations?.totalProgression ?? 0) >= 0.98
    ) {
      logger.debug(
        'Status is "To read" or "Reading" and progression is greater than 98%, setting to "Read"',
      )
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
    logger.debug(
      "Existing position is newer than incoming position, throwing conflict error",
    )
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

export function fromLegacyHref(href: string) {
  if (URL.canParse(href)) {
    return href
  }

  try {
    const newUrl = new URL(href, "https://storyteller.local")
    const newHref = newUrl.pathname.slice(1)
    return newHref
  } catch (err) {
    logger.warn({ msg: "Error parsing URL", href, err })

    // somethings off, use more crude algorighm
    const newHref = href.startsWith("/") ? href.slice(1) : href

    /**
     * already encoded
     */
    if (decodeURIComponent(href).length < href.length) {
      return newHref
    }

    // encode each path segment separately to preserve slashes
    return newHref
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
  }
}

export function toLegacyHref(href: string) {
  if (URL.canParse(href)) {
    return href
  }

  // we dont need to decode it
  return `/${href}`
}

export function fromLegacyLocator(locator: ReadiumLocator) {
  return {
    ...locator,
    href: fromLegacyHref(locator.href),
  }
}

export function toLegacyLocator(locator: ReadiumLocator) {
  return {
    ...locator,
    href: toLegacyHref(locator.href),
  }
}
