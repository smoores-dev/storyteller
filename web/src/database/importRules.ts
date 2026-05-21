import { type Selectable } from "kysely"
import { jsonArrayFrom } from "kysely/helpers/sqlite"

import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type DB, type ImportRuleSource } from "./schema"

export type ImportRule = Selectable<DB["importRule"]>
export type ImportRuleKind = ImportRule["kind"]

export type ImportRuleWithCollections = ImportRule & {
  collections: { uuid: UUID; name: string }[]
  bookTitle: string | null
}

export type { ImportRuleSource }

export async function getImportRules(
  kind?: ImportRuleKind,
): Promise<ImportRuleWithCollections[]> {
  const rules = await db
    .selectFrom("importRule")
    .leftJoin("book", "book.uuid", "importRule.bookUuid")
    .selectAll("importRule")
    .select("book.title as bookTitle")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("importRuleToCollection")
          .innerJoin(
            "collection",
            "importRuleToCollection.collectionUuid",
            "collection.uuid",
          )
          .select(["collection.uuid", "collection.name"])
          .whereRef(
            "importRuleToCollection.importRuleUuid",
            "=",
            "importRule.uuid",
          ),
      ).as("collections"),
    ])
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    .$if(!!kind, (qb) => qb.where("importRule.kind", "=", kind!))
    .orderBy("importRule.createdAt", "asc")
    .execute()

  return rules
}

/**
 * UI-facing list: only rules the user created. auto-rules (relocate / backup /
 * prevent-reimport) are hidden so they don't clutter the settings page.
 */
export async function getUserImportRules(): Promise<
  ImportRuleWithCollections[]
> {
  const rules = await db
    .selectFrom("importRule")
    .leftJoin("book", "book.uuid", "importRule.bookUuid")
    .selectAll("importRule")
    .select("book.title as bookTitle")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("importRuleToCollection")
          .innerJoin(
            "collection",
            "importRuleToCollection.collectionUuid",
            "collection.uuid",
          )
          .select(["collection.uuid", "collection.name"])
          .whereRef(
            "importRuleToCollection.importRuleUuid",
            "=",
            "importRule.uuid",
          ),
      ).as("collections"),
    ])
    .where("importRule.source", "=", "user")
    .orderBy("importRule.createdAt", "asc")
    .execute()

  return rules
}

export async function getWatchRules(): Promise<ImportRuleWithCollections[]> {
  return getImportRules("watch")
}

export async function getIgnorePaths(): Promise<string[]> {
  const rows = await db
    .selectFrom("importRule")
    .select(["path"])
    .where("kind", "=", "ignore")
    .distinct()
    .execute()

  return rows.map((r) => r.path)
}

export type CreateImportRuleInput = {
  kind: ImportRuleKind
  path: string
  importMode?: string | null
  collectionUuids?: UUID[]
}

export async function createImportRule(
  input: CreateImportRuleInput,
): Promise<ImportRuleWithCollections> {
  const { kind, path, importMode, collectionUuids } = input

  return await db.transaction().execute(async (tr) => {
    const { uuid } = await tr
      .insertInto("importRule")
      .values({
        kind,
        path,
        importMode: importMode ?? null,
      })
      .returning(["uuid"])
      .executeTakeFirstOrThrow()

    if (collectionUuids?.length) {
      await tr
        .insertInto("importRuleToCollection")
        .values(
          collectionUuids.map((collectionUuid) => ({
            importRuleUuid: uuid,
            collectionUuid,
          })),
        )
        .execute()
    }

    const rule = await tr
      .selectFrom("importRule")
      .leftJoin("book", "book.uuid", "importRule.bookUuid")
      .selectAll("importRule")
      .select("book.title as bookTitle")
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom("importRuleToCollection")
            .innerJoin(
              "collection",
              "importRuleToCollection.collectionUuid",
              "collection.uuid",
            )
            .select(["collection.uuid", "collection.name"])
            .whereRef(
              "importRuleToCollection.importRuleUuid",
              "=",
              "importRule.uuid",
            ),
        ).as("collections"),
      ])
      .where("importRule.uuid", "=", uuid)
      .executeTakeFirstOrThrow()

    return rule
  })
}

export type UpdateImportRuleInput = {
  path?: string
  importMode?: string | null
  collectionUuids?: UUID[]
}

export async function updateImportRule(
  uuid: UUID,
  input: UpdateImportRuleInput,
): Promise<ImportRuleWithCollections> {
  return await db.transaction().execute(async (tr) => {
    const updates: Record<string, unknown> = {}
    if (input.path !== undefined) {
      updates["path"] = input.path
    }
    if (input.importMode !== undefined) {
      updates["importMode"] = input.importMode
    }

    if (Object.keys(updates).length > 0) {
      await tr
        .updateTable("importRule")
        .set(updates)
        .where("uuid", "=", uuid)
        .execute()
    }

    if (input.collectionUuids !== undefined) {
      await tr
        .deleteFrom("importRuleToCollection")
        .where("importRuleUuid", "=", uuid)
        .execute()

      if (input.collectionUuids.length > 0) {
        await tr
          .insertInto("importRuleToCollection")
          .values(
            input.collectionUuids.map((collectionUuid) => ({
              importRuleUuid: uuid,
              collectionUuid,
            })),
          )
          .execute()
      }
    }

    return await tr
      .selectFrom("importRule")
      .leftJoin("book", "book.uuid", "importRule.bookUuid")
      .selectAll("importRule")
      .select("book.title as bookTitle")
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom("importRuleToCollection")
            .innerJoin(
              "collection",
              "importRuleToCollection.collectionUuid",
              "collection.uuid",
            )
            .select(["collection.uuid", "collection.name"])
            .whereRef(
              "importRuleToCollection.importRuleUuid",
              "=",
              "importRule.uuid",
            ),
        ).as("collections"),
      ])
      .where("importRule.uuid", "=", uuid)
      .executeTakeFirstOrThrow()
  })
}

export async function deleteImportRule(uuid: UUID) {
  await db.deleteFrom("importRule").where("uuid", "=", uuid).execute()
}

export async function deleteImportRules(uuids: UUID[]) {
  if (!uuids.length) return

  await db.deleteFrom("importRule").where("uuid", "in", uuids).execute()
}

export async function addIgnoreRule(
  path: string,
  attribution?: { source?: ImportRuleSource; bookUuid?: UUID | null },
) {
  await db
    .insertInto("importRule")
    .values({
      kind: "ignore",
      path,
      ...(attribution?.source && { source: attribution.source }),
      ...(attribution?.bookUuid !== undefined && {
        bookUuid: attribution.bookUuid,
      }),
    })
    .onConflict((oc) => oc.column("path").doNothing())
    .execute()
}

export async function removeIgnoreRules(paths: string[]) {
  if (!paths.length) return

  await db
    .deleteFrom("importRule")
    .where("kind", "=", "ignore")
    .where("path", "in", paths)
    .execute()
}

export async function getImportRulesForCollection(
  collectionUuid: UUID,
): Promise<ImportRuleWithCollections[]> {
  const rules = await db
    .selectFrom("importRule")
    .innerJoin(
      "importRuleToCollection",
      "importRuleToCollection.importRuleUuid",
      "importRule.uuid",
    )
    .leftJoin("book", "book.uuid", "importRule.bookUuid")
    .selectAll("importRule")
    .select("book.title as bookTitle")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("importRuleToCollection as irtc2")
          .innerJoin("collection", "irtc2.collectionUuid", "collection.uuid")
          .select(["collection.uuid", "collection.name"])
          .whereRef("irtc2.importRuleUuid", "=", "importRule.uuid"),
      ).as("collections"),
    ])
    .where("importRuleToCollection.collectionUuid", "=", collectionUuid)
    .orderBy("importRule.createdAt", "asc")
    .execute()

  return rules
}
