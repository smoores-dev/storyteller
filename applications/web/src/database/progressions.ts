import { jsonArrayFrom } from "kysely/helpers/sqlite"

import { db } from "@/database/connection.ts"
import { logger } from "@/logging.ts"
import { entries } from "@/objects.ts"
import { type UriReference } from "@/progress/uriReference.ts"
import { type ProgressionDocument } from "@/schemas/v3/progress.ts"
import { type UUID } from "@/uuid.ts"

import { STATUS_READ, STATUS_READING, STATUS_TO_READ } from "./statusKinds"

export async function getProgressionDocument(
  userId: UUID,
  bookUuid: UUID,
  format: "ebook" | "readaloud" | "audiobook",
): Promise<ProgressionDocument | undefined> {
  const progression = await db
    .selectFrom("progression")
    .select([
      "bookUuid",
      "deviceId",
      "deviceName",
      "title",
      "modified",
      "progression",
    ])
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("progressionReference")
          .select(["progressionReference.value"])
          .whereRef(
            "progression.uuid",
            "=",
            "progressionReference.progressionUuid",
          ),
      ).as("references"),
    ])
    .where("userId", "=", userId)
    .where("bookUuid", "=", bookUuid)
    .where("format", "=", format)
    .executeTakeFirst()

  if (!progression) return progression

  const { deviceId, deviceName, ...rest } = progression

  return {
    ...rest,
    title: progression.title ?? undefined,
    references: progression.references.map(({ value }) => value),
    modified: progression.modified.toISOString(),
    device: {
      id: deviceId,
      name: deviceName,
    },
  }
}

export async function upsertProgression(
  userId: UUID,
  bookUuid: UUID,
  format: "ebook" | "audiobook" | "readaloud" | null,
  progressionDocuments: Partial<
    Record<
      "ebook" | "audiobook" | "readaloud",
      Omit<ProgressionDocument, "references"> & { references: UriReference[] }
    >
  >,
) {
  logger.debug("upsertPosition(...)")
  logger.debug("Incoming progressions")
  logger.debug({
    userId,
    bookUuid,
    progressionDocuments,
  })

  await db.transaction().execute(async (tr) => {
    const status = await tr
      .selectFrom("bookToStatus")
      .select(["statusUuid"])
      .where("bookUuid", "=", bookUuid)
      .where("userId", "=", userId)
      .executeTakeFirst()

    for (const [format, progressionDocument] of entries(progressionDocuments)) {
      const { device, references, ...progression } = progressionDocument

      const existing = await tr
        .selectFrom("progression")
        .select(["uuid", "modified"])
        .where("userId", "=", userId)
        .where("bookUuid", "=", bookUuid)
        .where("format", "=", format)
        .executeTakeFirst()

      if (existing) {
        logger.debug("Existing progression")
        logger.debug(existing)
      }

      let uuid = existing?.uuid

      if (!existing || !uuid) {
        const newProgression = await tr
          .insertInto("progression")
          .values({
            ...progression,
            format,
            modified: progression.modified as unknown as Date,
            deviceId: device.id,
            deviceName: device.name,
            userId,
            bookUuid,
          })
          .returning("uuid as uuid")
          .executeTakeFirstOrThrow()

        logger.debug("No existing progression, created new row")

        uuid = newProgression.uuid
      } else {
        if (
          existing.modified.valueOf() >
          new Date(progressionDocument.modified).valueOf()
        ) {
          logger.debug(
            "Existing progression is newer than incoming progression, aborting",
          )
          throw new ProgressionConflictError()
        }

        if (
          existing.modified.valueOf() ===
          new Date(progressionDocument.modified).valueOf()
        ) {
          // Technically we aren't confirming equality
          // here, so a client could mess up and send a new
          // progression with the same modified timestamp
          // and think it saved when in fact it did not.
          // A better approach would also check that the
          // top level fields are equal and h
          // that all of the provided refs exist with the same
          // values, but that would require some plumbing I'm
          // not feeling up for at the moment.
          logger.debug(
            "Existing progression is the same as incoming progression, doing nothing",
          )
          throw new ProgressionNoopError()
        }

        logger.debug(
          "Incoming progression has newer timestamp than existing progression, updating",
        )

        await tr
          .updateTable("progression")
          .set({
            ...progression,
            modified: progression.modified as unknown as Date,
            deviceId: device.id,
            deviceName: device.name,
          })
          .where("uuid", "=", uuid)
          .execute()

        logger.debug("Updated existing progression")
      }

      for (const reference of references) {
        const kind = reference.fragmentKind
        if (!kind) continue

        const value = reference.href

        await tr
          .insertInto("progressionReference")
          .values({
            progressionUuid: uuid,
            kind,
            value,
          })
          .onConflict((cb) =>
            cb.columns(["progressionUuid", "kind"]).doUpdateSet({
              progressionUuid: uuid,
              kind,
              value,
            }),
          )
          .execute()
      }
    }

    const firstDocument = Object.values(progressionDocuments)[0]

    if (firstDocument == undefined) return

    const progression = firstDocument.progression

    const statuses = await tr.selectFrom("status").selectAll().execute()

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const toRead = statuses.find((status) => status.name === STATUS_TO_READ)!
    const reading = statuses.find((status) => status.name === STATUS_READING)!
    const read = statuses.find((status) => status.name === STATUS_READ)!
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    if ((!status || status.statusUuid === toRead.uuid) && progression < 0.98) {
      logger.debug(
        'Status is empty or "To read" and progression is less than 98%, setting to "Reading"',
      )
      await tr
        .updateTable("bookToStatus")
        .set({ statusUuid: reading.uuid })
        .where("bookToStatus.bookUuid", "=", bookUuid)
        .where("bookToStatus.userId", "=", userId)
        .execute()
    }
    if (
      (!status ||
        status.statusUuid === toRead.uuid ||
        status.statusUuid === reading.uuid) &&
      progression >= 0.98
    ) {
      logger.debug(
        'Status is empty or "To read" or "Reading" and progression is greater than 98%, setting to "Read"',
      )
      await tr
        .updateTable("bookToStatus")
        .set({ statusUuid: read.uuid })
        .where("bookToStatus.bookUuid", "=", bookUuid)
        .where("bookToStatus.userId", "=", userId)
        .execute()
    }

    const charRef =
      progressionDocuments.readaloud?.references.find(
        (ref) => ref.fragmentKind === "char",
      ) ??
      progressionDocuments.ebook?.references.find(
        (ref) => ref.fragmentKind === "char",
      )
    const mediaRef =
      progressionDocuments.readaloud?.references.find(
        (ref) => ref.fragmentKind === "media",
      ) ??
      progressionDocuments.audiobook?.references.find(
        (ref) => ref.fragmentKind === "media",
      )

    const last = await tr
      .selectFrom("progressionHistory")
      .select(["modified"])
      .where("userId", "=", userId)
      .where("bookUuid", "=", bookUuid)
      .orderBy("modified", "desc")
      .executeTakeFirst()

    // Only update at most once every 5 minutes
    if (
      !last ||
      new Date(firstDocument.modified).valueOf() - last.modified.valueOf() >
        5 * 60 * 1000
    ) {
      await tr
        .insertInto("progressionHistory")
        .values({
          userId,
          bookUuid,
          sourceFormat: format,
          deviceId: firstDocument.device.id,
          deviceName: firstDocument.device.name,
          modified: firstDocument.modified as unknown as Date,
          progression: firstDocument.progression,
          title: firstDocument.title,
          charRef: charRef?.href,
          mediaRef: mediaRef?.href,
        })
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  })
}

export class ProgressionConflictError extends Error {
  constructor() {
    super("Attempted to write a progression older than the current one")
    this.name = "ProgressionConflictError"
  }
}

export class ProgressionNoopError extends Error {
  constructor() {
    super("Attempted to write a progression equal to the current one")
    this.name = "ProgressionNoopError"
  }
}
