import {
  type Insertable,
  type Selectable,
  type Transaction,
  type Updateable,
} from "kysely"
import { jsonArrayFrom } from "kysely/helpers/sqlite"

import { scan } from "@/assets/library/scanner/scan"
import { getWatcher } from "@/assets/library/scanner/triggers/watcher"
import { BookEvents } from "@/events"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import { getBooks } from "./books"
import { db } from "./connection"
import { validateNoDuplicatePaths } from "./importPaths"
import { type DB } from "./schema"
import { getCollectionImportPaths, getSetting } from "./settings"
import { type ImportPathEntry } from "./settingsTypes"

export type Collection = Selectable<DB["collection"]>
export type NewCollection = Insertable<DB["collection"]>
export type CollectionUpdate = Updateable<DB["collection"]>

async function getAllImportPaths(
  excludeCollectionUuid?: UUID,
): Promise<Set<string>> {
  const [importPaths, collections] = await Promise.all([
    getSetting("importPath"),
    getCollectionImportPaths(),
  ])

  if (excludeCollectionUuid) {
    collections.delete(excludeCollectionUuid)
  }

  const rootPaths = new Set((importPaths ?? []).map((e) => e.path))

  return rootPaths.union(collections)
}

async function validateImportPaths(
  paths: ImportPathEntry[] | null,
  collectionUuid?: UUID,
) {
  validateNoDuplicatePaths(paths)

  if (!paths || paths.length === 0) return

  const existing = await getAllImportPaths(collectionUuid)
  const conflicts = paths.filter((e) => existing.has(e.path))

  if (conflicts.length > 0) {
    throw new Error(`import path already in use: "${conflicts[0]?.path}"`)
  }
}

export type CollectionWithRelations = Awaited<ReturnType<typeof getCollection>>

export async function getCollection(
  uuid: UUID,
  userId?: UUID,
  tr?: Transaction<DB>,
) {
  const collection = await (tr ?? db)
    .selectFrom("collection")
    .selectAll("collection")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("user")
          .innerJoin("collectionToUser", "collectionToUser.userId", "user.id")
          .select(["user.id", "user.email", "user.username"])
          .whereRef("collectionToUser.collectionUuid", "=", "collection.uuid"),
      ).as("users"),
    ])
    .$if(!!userId, (qb) =>
      qb
        .leftJoin(
          "collectionToUser",
          "collection.uuid",
          "collectionToUser.collectionUuid",
        )
        .where((eb) =>
          eb.or([
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eb("collectionToUser.userId", "=", userId!),
            eb("collection.public", "=", true),
          ]),
        ),
    )
    .where("collection.uuid", "=", uuid)
    .executeTakeFirstOrThrow()

  return collection
}

export async function getCollections(userId?: UUID) {
  return await db
    .selectFrom("collection")
    .selectAll("collection")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("user")
          .innerJoin("collectionToUser", "collectionToUser.userId", "user.id")
          .select(["user.id", "user.email", "user.username"])
          .whereRef("collectionToUser.collectionUuid", "=", "collection.uuid"),
      ).as("users"),
    ])
    .$if(!!userId, (qb) =>
      qb
        .leftJoin(
          "collectionToUser",
          "collection.uuid",
          "collectionToUser.collectionUuid",
        )
        .where((eb) =>
          eb.or([
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eb("collectionToUser.userId", "=", userId!),
            eb("collection.public", "=", true),
          ]),
        ),
    )
    .groupBy("collection.uuid")
    .execute()
}

export type CollectionCreateInput = Omit<NewCollection, "importPaths"> & {
  importPaths?: ImportPathEntry[] | null
}

export async function createCollection(
  input: CollectionCreateInput,
  relations: { users?: UUID[] } = {},
) {
  const { importPaths, ...rest } = input

  if (importPaths) {
    await validateImportPaths(importPaths)
  }

  const insert: NewCollection = {
    ...rest,
    ...(importPaths !== undefined && {
      importPaths: importPaths ? JSON.stringify(importPaths) : null,
    }),
  }

  return await db.transaction().execute(async (tr) => {
    const { uuid } = await tr
      .insertInto("collection")
      .values(insert)
      .returning(["uuid as uuid"])
      .executeTakeFirstOrThrow()

    const collection = await getCollection(uuid, undefined, tr)

    if (!collection.public && relations.users) {
      await tr
        .insertInto("collectionToUser")
        .values(
          relations.users.map((user) => ({
            collectionUuid: collection.uuid,
            userId: user,
          })),
        )
        .execute()
    }

    return collection
  })
}

export type CollectionInput = Omit<CollectionUpdate, "importPaths"> & {
  importPaths?: ImportPathEntry[] | null
}

export async function updateCollection(
  uuid: UUID,
  input: CollectionInput,
  relations: { users?: UUID[] } = {},
) {
  const { importPaths, ...rest } = input

  if (importPaths) {
    await validateImportPaths(importPaths, uuid)
  }

  const update: CollectionUpdate = {
    ...rest,
    ...(importPaths !== undefined && {
      importPaths: importPaths ? JSON.stringify(importPaths) : null,
    }),
  }

  const previousCollection = await getCollection(uuid)

  const collection = await db.transaction().execute(async (tr) => {
    if (Object.keys(update).length) {
      await tr
        .updateTable("collection")
        .set(update)
        .where("uuid", "=", uuid)
        .execute()
    }

    const collection = await getCollection(uuid, undefined, tr)

    if (!collection.public && relations.users) {
      await tr
        .deleteFrom("collectionToUser")
        .where("collectionUuid", "=", uuid)
        .execute()

      await tr
        .insertInto("collectionToUser")
        .values(
          relations.users.map((user) => ({
            collectionUuid: collection.uuid,
            userId: user,
          })),
        )
        .execute()
    }

    return collection
  })

  await getWatcher().update(uuid)

  const prevEntries = previousCollection.importPaths as ImportPathEntry[] | null
  const nextEntries = collection.importPaths as ImportPathEntry[] | null
  const prevPathSet = new Set((prevEntries ?? []).map((e) => e.path))
  const addedPaths = (nextEntries ?? [])
    .map((e) => e.path)
    .filter((p) => !prevPathSet.has(p))

  if (addedPaths.length > 0) {
    logger.info({
      msg: "collection import paths changed, triggering scan for new paths",
      collectionUuid: uuid,
      newPaths: addedPaths,
    })

    console.log("addedPaths", addedPaths)
    void scan({
      source: "manual",
      tasks: addedPaths.map((importPath) => ({
        kind: "import-path" as const,
        importPath,
        collection: uuid,
      })),
      signal: new AbortController().signal,
    })
  }

  return collection
}

export async function addBooksToCollections(
  collectionUuids: UUID[],
  bookUuids: UUID[],
) {
  await db
    .insertInto("bookToCollection")
    .values(
      collectionUuids.flatMap((collection) =>
        bookUuids.map((book) => ({
          collectionUuid: collection,
          bookUuid: book,
        })),
      ),
    )
    .execute()

  const collections = await getCollections()
  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        collections: [
          ...book.collections,
          ...collectionUuids
            .map((collectionUuid) =>
              collections.find((c) => c.uuid === collectionUuid),
            )
            .filter((c) => !!c),
        ],
      },
    })
  })
}

export async function removeBooksFromCollections(
  collectionUuids: UUID[],
  bookUuids: UUID[],
) {
  await db
    .deleteFrom("bookToCollection")
    .where("bookUuid", "in", bookUuids)
    .where("collectionUuid", "in", collectionUuids)
    .execute()

  const books = await getBooks(bookUuids)

  books.forEach((book) => {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: {
        collections: book.collections.filter(
          (c) => !collectionUuids.includes(c.uuid),
        ),
      },
    })
  })
}

export async function deleteCollection(uuid: UUID, userId: UUID) {
  await db.transaction().execute(async (tr) => {
    const { public: isPublic } = await tr
      .selectFrom("collection")
      .select(["public"])
      .where("uuid", "=", uuid)
      .executeTakeFirstOrThrow()
    const hasPermission = await tr
      .selectFrom("collectionToUser")
      .select(["uuid"])
      .where("collectionUuid", "=", uuid)
      .where("userId", "=", userId)
      .executeTakeFirst()

    if (!isPublic && !hasPermission) return

    await tr
      .deleteFrom("bookToCollection")
      .where("collectionUuid", "=", uuid)
      .execute()

    await tr
      .deleteFrom("collectionToUser")
      .where("collectionToUser.collectionUuid", "=", uuid)
      .execute()
    await tr.deleteFrom("collection").where("uuid", "=", uuid).execute()
  })

  await getWatcher().remove(uuid)
}
