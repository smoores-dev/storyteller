import {
  type Insertable,
  type Selectable,
  type Transaction,
  type Updateable,
} from "kysely"
import { jsonArrayFrom } from "kysely/helpers/sqlite"

import {
  type HomeSectionKind,
  SHELF_ORDER_BY_FIELDS,
  type ShelfFilter,
  ShelfFilterInvalidError,
  type ShelfFilterIssue,
  type ShelfOrderBy,
  collectFilterIssues,
} from "@/shelves"
import { type SortField } from "@/sort"
import { type UUID } from "@/uuid"

export { HomeSectionKind, SHELF_ORDER_BY_FIELDS } from "@/shelves"
export type { ShelfOrderBy } from "@/shelves"

import { type BookWithRelations, hydrateBooks } from "./books"
import { db } from "./connection"
import { type DB } from "./schema"
import {
  bookVisibleTo,
  buildBookSearchExpression,
  buildFilterExpression,
  buildSortExpression,
  extractEntityReferences,
} from "./shelfFilter"

export type Shelf = Selectable<DB["shelf"]>
export type NewShelf = Insertable<DB["shelf"]>
export type ShelfUpdate = Updateable<DB["shelf"]>

export type HomeSection = Selectable<DB["homeSection"]>

export type ShelfWithBooks = Awaited<ReturnType<typeof getShelf>>
export type HomeSectionWithDetails = Awaited<
  ReturnType<typeof getHomeSections>
>[number]

function readFilter(filter: string | ShelfFilter | null): {
  filter: ShelfFilter | null
  filterIssues: ShelfFilterIssue[]
} {
  if (!filter) return { filter: null, filterIssues: [] }

  let parsed: unknown = filter
  if (typeof filter === "string") {
    try {
      parsed = JSON.parse(filter)
    } catch {
      return { filter: null, filterIssues: [{ kind: "unparseable" }] }
    }
  }

  return {
    filter: parsed as ShelfFilter,
    filterIssues: collectFilterIssues(parsed),
  }
}

function getShelfBase(uuid: UUID, userId: UUID, tr?: Transaction<DB>) {
  return (tr ?? db)
    .selectFrom("shelf")
    .selectAll("shelf")
    .where("shelf.uuid", "=", uuid)
    .where("shelf.userId", "=", userId)
}

export function getShelfBare(uuid: UUID, userId: UUID, tr?: Transaction<DB>) {
  return getShelfBase(uuid, userId, tr).executeTakeFirstOrThrow()
}

export async function getShelf(uuid: UUID, userId: UUID, tr?: Transaction<DB>) {
  const shelf = await getShelfBase(uuid, userId, tr)
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("shelfBook")
          .select(["shelfBook.bookUuid", "shelfBook.position"])
          .whereRef("shelfBook.shelfUuid", "=", "shelf.uuid")
          .orderBy("shelfBook.position", "asc"),
      ).as("books"),
    ])
    .executeTakeFirstOrThrow()

  return { ...shelf, ...readFilter(shelf.filter) }
}

export async function getShelves(userId: UUID) {
  const shelves = await db
    .selectFrom("shelf")
    .selectAll("shelf")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("shelfBook")
          .select(["shelfBook.bookUuid", "shelfBook.position"])
          .whereRef("shelfBook.shelfUuid", "=", "shelf.uuid")
          .orderBy("shelfBook.position", "asc"),
      ).as("books"),
    ])
    .where("shelf.userId", "=", userId)
    .execute()

  return shelves.map((shelf) => ({ ...shelf, ...readFilter(shelf.filter) }))
}

export async function createShelf(
  userId: UUID,
  insert: Omit<NewShelf, "userId">,
  bookUuids?: UUID[],
) {
  return await db.transaction().execute(async (tr) => {
    const filterString = insert.filter
      ? typeof insert.filter === "string"
        ? insert.filter
        : JSON.stringify(insert.filter)
      : null

    const { uuid } = await tr
      .insertInto("shelf")
      .values({
        ...insert,
        userId,
        filter: filterString,
      })
      .returning(["uuid as uuid"])
      .executeTakeFirstOrThrow()

    if (filterString) {
      const filter = JSON.parse(filterString) as ShelfFilter
      const refs = extractEntityReferences(filter)

      if (refs.length > 0) {
        await tr
          .insertInto("shelfFilterReference")
          .values(
            refs.map((ref) => ({
              shelfUuid: uuid,
              entityType: ref.entityType,
              entityUuid: ref.entityUuid,
            })),
          )
          .execute()
      }
    }

    if (bookUuids && bookUuids.length > 0) {
      await tr
        .insertInto("shelfBook")
        .values(
          bookUuids.map((bookUuid, index) => ({
            shelfUuid: uuid,
            bookUuid,
            position: index,
          })),
        )
        .execute()
    }

    return await getShelf(uuid, userId, tr)
  })
}

export async function updateShelf(
  uuid: UUID,
  userId: UUID,
  update: ShelfUpdate,
  bookUuids?: UUID[],
) {
  return await db.transaction().execute(async (tr) => {
    const filterString =
      update.filter !== undefined
        ? update.filter
          ? typeof update.filter === "string"
            ? update.filter
            : JSON.stringify(update.filter)
          : null
        : undefined

    const updateValues = {
      ...update,
      ...(filterString !== undefined ? { filter: filterString } : {}),
    }

    if (Object.keys(updateValues).length > 0) {
      await tr
        .updateTable("shelf")
        .set(updateValues)
        .where("uuid", "=", uuid)
        .where("userId", "=", userId)
        .execute()
    }

    if (filterString !== undefined) {
      await tr
        .deleteFrom("shelfFilterReference")
        .where("shelfUuid", "=", uuid)
        .execute()

      if (filterString) {
        const filter = JSON.parse(filterString) as ShelfFilter
        const refs = extractEntityReferences(filter)

        if (refs.length > 0) {
          await tr
            .insertInto("shelfFilterReference")
            .values(
              refs.map((ref) => ({
                shelfUuid: uuid,
                entityType: ref.entityType,
                entityUuid: ref.entityUuid,
              })),
            )
            .execute()
        }
      }
    }

    if (bookUuids !== undefined) {
      await tr.deleteFrom("shelfBook").where("shelfUuid", "=", uuid).execute()

      if (bookUuids.length > 0) {
        await tr
          .insertInto("shelfBook")
          .values(
            bookUuids.map((bookUuid, index) => ({
              shelfUuid: uuid,
              bookUuid,
              position: index,
            })),
          )
          .execute()
      }
    }

    return await getShelf(uuid, userId, tr)
  })
}

export async function deleteShelf(uuid: UUID, userId: UUID) {
  await db.transaction().execute(async (tr) => {
    await tr.deleteFrom("shelfBook").where("shelfUuid", "=", uuid).execute()

    await tr
      .deleteFrom("shelfFilterReference")
      .where("shelfUuid", "=", uuid)
      .execute()

    await tr
      .deleteFrom("homeSection")
      .where("shelfUuid", "=", uuid)
      .where("userId", "=", userId)
      .execute()

    await tr
      .deleteFrom("shelf")
      .where("uuid", "=", uuid)
      .where("userId", "=", userId)
      .execute()
  })
}

export type HomeSectionInput = {
  shelfUuid?: UUID | null
  kind: HomeSectionKind
  enabled?: boolean
  config?: unknown
}

function parseConfig(config: string | null): unknown {
  if (!config) return null
  try {
    return JSON.parse(config)
  } catch {
    return null
  }
}

export async function getHomeSections(userId: UUID) {
  const sections = await db
    .selectFrom("homeSection")
    .leftJoin("shelf", "shelf.uuid", "homeSection.shelfUuid")
    .select([
      "homeSection.uuid",
      "homeSection.shelfUuid",
      "homeSection.kind",
      "homeSection.enabled",
      "homeSection.config",
      "homeSection.position",
      "homeSection.createdAt",
      "homeSection.updatedAt",
      "shelf.name as shelfName",
      "shelf.description as shelfDescription",
      "shelf.filter as shelfFilter",
    ])
    .where("homeSection.userId", "=", userId)
    .orderBy("homeSection.position", "asc")
    .execute()

  return sections.map((hs) => ({
    uuid: hs.uuid,
    shelfUuid: hs.shelfUuid,
    kind: hs.kind,
    enabled: hs.enabled !== 0,
    config: parseConfig(hs.config),
    position: hs.position,
    createdAt: hs.createdAt,
    updatedAt: hs.updatedAt,
    name: hs.shelfName,
    description: hs.shelfDescription,
    ...readFilter(hs.shelfFilter),
  }))
}

export async function setHomeSections(
  userId: UUID,
  sections: HomeSectionInput[],
) {
  await db.transaction().execute(async (tr) => {
    await tr.deleteFrom("homeSection").where("userId", "=", userId).execute()

    if (sections.length === 0) return

    await tr
      .insertInto("homeSection")
      .values(
        sections.map((section, index) => ({
          userId,
          shelfUuid: section.shelfUuid ?? null,
          kind: section.kind,
          enabled: section.enabled === false ? 0 : 1,
          config:
            section.config != null ? JSON.stringify(section.config) : null,
          position: index,
        })),
      )
      .execute()
  })
}

async function addHomeSection(userId: UUID, section: HomeSectionInput) {
  const maxPosition = await db
    .selectFrom("homeSection")
    .select((eb) => eb.fn.max("position").as("maxPos"))
    .where("userId", "=", userId)
    .executeTakeFirst()

  const position = (maxPosition?.maxPos ?? -1) + 1

  const { uuid } = await db
    .insertInto("homeSection")
    .values({
      userId,
      shelfUuid: section.shelfUuid ?? null,
      kind: section.kind,
      enabled: section.enabled === false ? 0 : 1,
      config: section.config != null ? JSON.stringify(section.config) : null,
      position,
    })
    .returning(["uuid"])
    .executeTakeFirstOrThrow()

  return uuid
}

export async function setHomeSectionEnabled(
  uuid: UUID,
  userId: UUID,
  enabled: boolean,
) {
  await db
    .updateTable("homeSection")
    .set({ enabled: enabled ? 1 : 0 })
    .where("uuid", "=", uuid)
    .where("userId", "=", userId)
    .execute()
}

const DEFAULT_HOME_SECTIONS: HomeSectionInput[] = [
  { kind: "getStarted" },
  { kind: "hero" },
  { kind: "stats" },
  { kind: "currentlyReading" },
  { kind: "recentlyAdded" },
  { kind: "addSection" },
]

const RECONCILABLE_BUILTINS: HomeSectionKind[] = ["getStarted", "addSection"]

export async function ensureHomeSectionDefaults(userId: UUID) {
  const existing = await db
    .selectFrom("homeSection")
    .select(["kind"])
    .where("userId", "=", userId)
    .execute()

  if (existing.length === 0) {
    await setHomeSections(userId, DEFAULT_HOME_SECTIONS)
    return
  }

  const existingKinds = new Set(existing.map((row) => row.kind))
  const missing = RECONCILABLE_BUILTINS.filter((k) => !existingKinds.has(k))

  for (const kind of missing) {
    await addHomeSection(userId, { kind })
  }
}

export type GetShelfBooksOptions = {
  limit?: number
  offset?: number
  orderBy?: ShelfOrderBy
  orderDirection?: "asc" | "desc"
  filter?: ShelfFilter
  search?: string
  sortField?: SortField
  includeManifest?: boolean
}

export async function getShelfBooks(
  shelfUuid: UUID,
  userId: UUID,
  opts?: GetShelfBooksOptions,
): Promise<BookWithRelations[]> {
  const shelf = await getShelf(shelfUuid, userId)
  if (shelf.filterIssues.length > 0) {
    throw new ShelfFilterInvalidError(shelf.filterIssues)
  }
  const filter = shelf.filter

  const manualBookUuids = shelf.books.map((b) => b.bookUuid)

  const hasManualBooks = manualBookUuids.length > 0
  const hasFilter = filter !== null

  if (!hasManualBooks && !hasFilter) {
    return []
  }

  let query = db
    .selectFrom("book")
    .select("book.uuid")
    .where((eb) => bookVisibleTo(eb, "book.uuid", userId))

  if (hasFilter && hasManualBooks) {
    query = query.where((eb) =>
      eb.or([
        eb("book.uuid", "in", manualBookUuids),
        buildFilterExpression(eb, filter, userId),
      ]),
    )
  } else if (hasFilter) {
    query = query.where((eb) => buildFilterExpression(eb, filter, userId))
  } else if (hasManualBooks) {
    query = query.where("book.uuid", "in", manualBookUuids)
  }

  if (opts?.filter) {
    const adHoc = opts.filter
    const adHocIssues = collectFilterIssues(adHoc)
    if (adHocIssues.length > 0) throw new ShelfFilterInvalidError(adHocIssues)
    query = query.where((eb) => buildFilterExpression(eb, adHoc, userId))
  }
  if (opts?.search) {
    const term = opts.search
    query = query.where((eb) => buildBookSearchExpression(eb, term))
  }

  const shelfLimit = (shelf as { limitCount?: number | null }).limitCount
  let effectiveLimit = opts?.limit ?? shelfLimit

  if (opts?.limit != null && shelfLimit != null) {
    const remaining = Math.max(0, shelfLimit - (opts.offset ?? 0))
    effectiveLimit = Math.min(opts.limit, remaining)
  }

  if (effectiveLimit != null) {
    query = query.limit(effectiveLimit)
  }

  if (opts?.offset) {
    query = query.offset(opts.offset)
  }

  const shelfOrderBy = (shelf as { orderBy?: string | null })
    .orderBy as ShelfOrderBy | null
  const shelfOrderDirection = (shelf as { orderDirection?: string | null })
    .orderDirection as "asc" | "desc" | null

  const orderDirection = opts?.orderDirection ?? shelfOrderDirection ?? "desc"

  if (opts?.sortField) {
    query = query.orderBy(
      buildSortExpression(opts.sortField, { userId }),
      orderDirection,
    )
    return await hydrateBooks(query, userId, opts)
  }

  const rawOrderBy: string = opts?.orderBy ?? shelfOrderBy ?? "createdAt"
  const remappedOrderBy = rawOrderBy === "rating" ? "userRating" : rawOrderBy
  const orderBy: ShelfOrderBy = (
    SHELF_ORDER_BY_FIELDS as readonly string[]
  ).includes(remappedOrderBy)
    ? (remappedOrderBy as ShelfOrderBy)
    : "createdAt"

  if (orderBy === "position") {
    if (hasManualBooks) {
      query = query.orderBy(
        (eb) =>
          eb
            .case()
            .when("book.uuid", "in", manualBookUuids)
            .then(0)
            .else(1)
            .end(),
        "asc",
      )
    }
    query = query.orderBy("book.createdAt", orderDirection)
    return await hydrateBooks(query, userId, opts)
  }

  query = query.orderBy(
    buildSortExpression(orderBy, { userId }),
    orderDirection,
  )

  return await hydrateBooks(query, userId, opts)
}
