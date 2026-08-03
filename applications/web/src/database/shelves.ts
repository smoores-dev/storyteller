import {
  type Insertable,
  type Selectable,
  type Transaction,
  type Updateable,
} from "kysely"
import { jsonArrayFrom } from "kysely/helpers/sqlite"

import type { HomeSectionKind, ShelfFilter, ShelfOrderBy } from "@/shelves"
import { type SortField } from "@/sort"
import { type UUID } from "@/uuid"

// re-exported so the api layer + components can import the shelf vocabulary from
// the db module they already use.
export { HomeSectionKind, SHELF_ORDER_BY_FIELDS } from "@/shelves"
export type { ShelfOrderBy } from "@/shelves"

import { type BookWithRelations, booksQuery } from "./books"
import { db } from "./connection"
import { type DB } from "./schema"
import {
  buildBookSearchExpression,
  buildFilterExpression,
  buildSortExpression,
  extractEntityReferences,
} from "./shelfFilter"

export type Shelf = Selectable<DB["shelf"]>
export type NewShelf = Insertable<DB["shelf"]>
export type ShelfUpdate = Updateable<DB["shelf"]>

export type HomeSection = Selectable<DB["homeSection"]>
export type NewHomeSection = Insertable<DB["homeSection"]>
export type HomeSectionUpdate = Updateable<DB["homeSection"]>

export type ShelfWithBooks = Awaited<ReturnType<typeof getShelf>>
export type HomeSectionWithDetails = Awaited<
  ReturnType<typeof getHomeSections>
>[number]

function parseFilter(filter: string | ShelfFilter | null): ShelfFilter | null {
  if (!filter) return null
  if (typeof filter === "object") return filter

  try {
    return JSON.parse(filter) as ShelfFilter
  } catch {
    return null
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

  return {
    ...shelf,
    filter: shelf.filter ? parseFilter(shelf.filter) : null,
  }
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

  return shelves.map((shelf) => ({
    ...shelf,
    filter: shelf.filter ? parseFilter(shelf.filter) : null,
  }))
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

export async function addBooksToShelf(
  shelfUuid: UUID,
  _userId: UUID,
  bookUuids: UUID[],
) {
  const existing = await db
    .selectFrom("shelfBook")
    .select(["bookUuid"])
    .where("shelfUuid", "=", shelfUuid)
    .execute()

  const existingSet = new Set(existing.map((e) => e.bookUuid))
  const toAdd = bookUuids.filter((uuid) => !existingSet.has(uuid))

  if (toAdd.length === 0) return

  const maxPosition = await db
    .selectFrom("shelfBook")
    .select((eb) => eb.fn.max("position").as("maxPos"))
    .where("shelfUuid", "=", shelfUuid)
    .executeTakeFirst()

  const startPosition = (maxPosition?.maxPos ?? -1) + 1

  await db
    .insertInto("shelfBook")
    .values(
      toAdd.map((bookUuid, index) => ({
        shelfUuid,
        bookUuid,
        position: startPosition + index,
      })),
    )
    .execute()
}

export async function removeBooksFromShelf(
  shelfUuid: UUID,
  _userId: UUID,
  bookUuids: UUID[],
) {
  await db
    .deleteFrom("shelfBook")
    .where("shelfUuid", "=", shelfUuid)
    .where("bookUuid", "in", bookUuids)
    .execute()
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
    filter: hs.shelfFilter ? parseFilter(hs.shelfFilter) : null,
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

export async function addHomeSection(userId: UUID, section: HomeSectionInput) {
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

export async function removeHomeSection(uuid: UUID, userId: UUID) {
  await db
    .deleteFrom("homeSection")
    .where("uuid", "=", uuid)
    .where("userId", "=", userId)
    .execute()
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

export async function reorderHomeSections(userId: UUID, uuids: UUID[]) {
  await db.transaction().execute(async (tr) => {
    for (let i = 0; i < uuids.length; i++) {
      await tr
        .updateTable("homeSection")
        .set({ position: i })
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        .where("uuid", "=", uuids[i]!)
        .where("userId", "=", userId)
        .execute()
    }
  })
}

// the full set a brand-new user starts with. getStarted leads so an empty
// library sees a call to action (the content shelves below self-hide when
// empty); addSection always trails as the "add a section/shelf" footer.
const DEFAULT_HOME_SECTIONS: HomeSectionInput[] = [
  { kind: "getStarted" },
  { kind: "hero" },
  { kind: "stats" },
  { kind: "currentlyReading" },
  { kind: "recentlyAdded" },
  { kind: "addSection" },
]

// always-on builtins that must appear even for users whose rows predate them.
// reconciled on read (never re-added once a row exists, hidden or not), same
// guarantee as the sidebar's ensureSidebarDefaults.
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

// ---------------------------------------------------------------------------
// shelf books query
// ---------------------------------------------------------------------------

export type GetShelfBooksOptions = {
  limit?: number
  offset?: number
  orderBy?: ShelfOrderBy
  orderDirection?: "asc" | "desc"
  // an ad-hoc filter tree + free-text search, ANDed on top of the shelf's own
  // membership (manual books / saved filter). lets the shelf page reuse the
  // same quick/advanced filter UI as the books page.
  filter?: ShelfFilter
  search?: string
  // when present, ordering uses the sortField vocabulary (buildSortExpression)
  // instead of the shelf's ShelfOrderBy; takes precedence over orderBy.
  sortField?: SortField
}

export async function getShelfBooks(
  shelfUuid: UUID,
  userId: UUID,
  opts?: GetShelfBooksOptions,
): Promise<BookWithRelations[]> {
  const shelf = await getShelf(shelfUuid, userId)
  const filter = shelf.filter

  const manualBookUuids = shelf.books.map((b) => b.bookUuid)

  const hasManualBooks = manualBookUuids.length > 0
  const hasFilter = filter !== null

  if (!hasManualBooks && !hasFilter) {
    return []
  }

  let query = booksQuery(userId)

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

  // ad-hoc quick/advanced filter + search from the shelf page, ANDed on top.
  if (opts?.filter) {
    const adHoc = opts.filter
    query = query.where((eb) => buildFilterExpression(eb, adHoc, userId))
  }
  if (opts?.search) {
    const term = opts.search
    query = query.where((eb) => buildBookSearchExpression(eb, term))
  }

  // a paged request must still respect the shelf's own limitCount: the page
  // size is capped to whatever of the shelf's limit remains past the offset.
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

  // the shelf page drives ordering with the richer sortField vocabulary
  // (userRating, alignment, ...); home sections etc. still use ShelfOrderBy.
  if (opts?.sortField) {
    query = query.orderBy(
      buildSortExpression(opts.sortField, { userId }),
      orderDirection,
    )
    return await query.execute()
  }

  const rawOrderBy = opts?.orderBy ?? shelfOrderBy ?? "createdAt"
  // legacy shelves stored the removed aggregate "rating"; it now maps to the
  // user's own rating (mirrors the shelf-filter condition preprocess).
  const orderBy: ShelfOrderBy =
    (rawOrderBy as string) === "rating" ? "userRating" : rawOrderBy

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
    // manual "position" falls back to createdAt for the secondary/global order.
    query = query.orderBy("book.createdAt", orderDirection)
    return await query.execute()
  }

  // any other stored orderBy is a registry sort field; compile it the same way
  // the shelf page's live sortField does (handles asset / user / alignment
  // fields that aren't plain book columns).
  query = query.orderBy(
    buildSortExpression(orderBy, { userId }),
    orderDirection,
  )

  return await query.execute()
}
