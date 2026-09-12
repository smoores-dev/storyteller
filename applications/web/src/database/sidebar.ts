import { type Transaction } from "kysely"

import { SIDEBAR_BUILTINS, SIDEBAR_BUILTIN_KEYS } from "@/sidebar-builtins"
import { type UUID } from "@/uuid"

import { db } from "./connection"
import { type DB } from "./schema"

export type SidebarItemKind = "builtin" | "collection" | "shelf"

export type SidebarItemInput = {
  kind: SidebarItemKind
  builtinKey?: string | null
  collectionUuid?: string | null
  shelfUuid?: string | null
  hidden?: boolean
}

export type SidebarGroupKind =
  | "collections"
  | "shelves"
  | "main"
  | "library"
  | null

export type SidebarGroupInput = {
  uuid?: string | null
  name: string
  kind?: SidebarGroupKind
  hidden?: boolean
  items: SidebarItemInput[]
}

export type SidebarGroupWithItems = {
  uuid: string
  name: string
  kind: SidebarGroupKind
  position: number
  hidden: boolean
  items: SidebarItemDetail[]
}

export type SidebarItemDetail = {
  uuid: string
  kind: SidebarItemKind
  builtinKey: string | null
  collectionUuid: string | null
  shelfUuid: string | null
  position: number
  hidden: boolean
  name: string | null
  icon: string | null
  color: string | null
}

const KIND_GROUP_DEFAULTS = {
  main: { name: "Main", position: 0 },
  library: { name: "Library", position: 1 },
  collections: { name: "Collections", position: 10 },
  shelves: { name: "Shelves", position: 20 },
} as const

type SpecialGroupKind = keyof typeof KIND_GROUP_DEFAULTS

const SPECIAL_GROUP_KINDS = new Set<SpecialGroupKind>(
  Object.keys(KIND_GROUP_DEFAULTS) as SpecialGroupKind[],
)

export async function getSidebarGroups(
  userId: UUID,
): Promise<SidebarGroupWithItems[]> {
  const groups = await db
    .selectFrom("sidebarGroup")
    .selectAll()
    .where("userId", "=", userId)
    .orderBy("position", "asc")
    .execute()

  if (groups.length === 0) return []

  const items = await db
    .selectFrom("sidebarItem")
    .leftJoin("collection", "collection.uuid", "sidebarItem.collectionUuid")
    .leftJoin("shelf", "shelf.uuid", "sidebarItem.shelfUuid")
    .select([
      "sidebarItem.uuid",
      "sidebarItem.kind",
      "sidebarItem.builtinKey",
      "sidebarItem.collectionUuid",
      "sidebarItem.shelfUuid",
      "sidebarItem.position",
      "sidebarItem.hidden",
      "sidebarItem.groupUuid",
      "collection.name as collectionName",
      "collection.icon as collectionIcon",
      "collection.color as collectionColor",
      "shelf.name as shelfName",
      "shelf.icon as shelfIcon",
      "shelf.color as shelfColor",
    ])
    .where("sidebarItem.userId", "=", userId)
    .orderBy("sidebarItem.position", "asc")
    .execute()

  const itemsByGroup = new Map<string, SidebarItemDetail[]>()

  for (const group of groups) {
    itemsByGroup.set(group.uuid, [])
  }

  for (const item of items) {
    const groupUuid = item.groupUuid
    if (!groupUuid) continue

    const groupItems = itemsByGroup.get(groupUuid)
    if (!groupItems) continue

    groupItems.push({
      uuid: item.uuid,
      kind: item.kind as SidebarItemKind,
      builtinKey: item.builtinKey,
      collectionUuid: item.collectionUuid,
      shelfUuid: item.shelfUuid,
      position: item.position,
      hidden: item.hidden !== 0,
      name: item.collectionName ?? item.shelfName ?? null,
      icon: item.collectionIcon ?? item.shelfIcon ?? null,
      color: item.collectionColor ?? item.shelfColor ?? null,
    })
  }

  return groups.map((group) => ({
    uuid: group.uuid,
    name: group.name,
    kind: (group.kind as SidebarGroupKind) ?? null,
    position: group.position,
    hidden: group.hidden !== 0,
    items: itemsByGroup.get(group.uuid) ?? [],
  }))
}

async function getAccessibleEntityUuids(trx: Transaction<DB>, userId: UUID) {
  const [collections, shelves] = await Promise.all([
    trx
      .selectFrom("collection")
      .select(["collection.uuid"])
      .leftJoin(
        "collectionToUser",
        "collection.uuid",
        "collectionToUser.collectionUuid",
      )
      .where((eb) =>
        eb.or([
          eb("collectionToUser.userId", "=", userId),
          eb("collection.public", "=", true),
        ]),
      )
      .groupBy("collection.uuid")
      .execute(),

    trx
      .selectFrom("shelf")
      .select(["shelf.uuid"])
      .where("shelf.userId", "=", userId)
      .execute(),
  ])

  return {
    collectionUuids: collections.map((c) => c.uuid),
    shelfUuids: shelves.map((s) => s.uuid),
  }
}

export async function ensureSidebarDefaults(
  userId: UUID,
  tr?: Transaction<DB>,
) {
  const run = async (trx: Transaction<DB>) => {
    const [groups, items, { collectionUuids, shelfUuids }] = await Promise.all([
      trx
        .selectFrom("sidebarGroup")
        .select(["uuid", "kind", "position"])
        .where("userId", "=", userId)
        .execute(),
      trx
        .selectFrom("sidebarItem")
        .select([
          "uuid",
          "kind",
          "builtinKey",
          "collectionUuid",
          "shelfUuid",
          "position",
          "groupUuid",
        ])
        .where("userId", "=", userId)
        .orderBy("position", "asc")
        .execute(),
      getAccessibleEntityUuids(trx, userId),
    ])

    const groupUuidByKind = new Map<SpecialGroupKind, string>()
    for (const group of groups) {
      if (
        group.kind &&
        SPECIAL_GROUP_KINDS.has(group.kind as SpecialGroupKind)
      ) {
        groupUuidByKind.set(group.kind as SpecialGroupKind, group.uuid)
      }
    }

    for (const [kind, defaults] of Object.entries(KIND_GROUP_DEFAULTS) as [
      SpecialGroupKind,
      (typeof KIND_GROUP_DEFAULTS)[SpecialGroupKind],
    ][]) {
      if (groupUuidByKind.has(kind)) continue

      const uuid = crypto.randomUUID()
      await trx
        .insertInto("sidebarGroup")
        .values({
          uuid,
          userId,
          name: defaults.name,
          kind,
          position: defaults.position,
        })
        .execute()
      groupUuidByKind.set(kind, uuid)
    }

    const knownGroupUuids = new Set([
      ...groups.map((g) => g.uuid),
      ...groupUuidByKind.values(),
    ])

    const seenBuiltins = new Set<string>()
    const seenCollections = new Set<string>()
    const seenShelves = new Set<string>()
    const collectionSet = new Set<string>(collectionUuids)
    const liveItems: typeof items = []

    for (const item of items) {
      let stale = false

      if (item.kind === "builtin") {
        const key = item.builtinKey
        stale = !key || !SIDEBAR_BUILTIN_KEYS.has(key) || seenBuiltins.has(key)
        if (!stale && key) seenBuiltins.add(key)
      } else if (item.kind === "collection") {
        stale =
          !item.collectionUuid ||
          !collectionSet.has(item.collectionUuid) ||
          seenCollections.has(item.collectionUuid)
        if (!stale && item.collectionUuid)
          seenCollections.add(item.collectionUuid)
      } else if (item.kind === "shelf") {
        stale = !item.shelfUuid || seenShelves.has(item.shelfUuid)
        if (!stale && item.shelfUuid) seenShelves.add(item.shelfUuid)
      } else {
        stale = true
      }

      if (stale) {
        await trx
          .deleteFrom("sidebarItem")
          .where("uuid", "=", item.uuid)
          .execute()
        continue
      }

      liveItems.push(item)
    }

    for (const item of liveItems) {
      if (item.groupUuid && knownGroupUuids.has(item.groupUuid)) continue

      const kind =
        item.kind === "collection"
          ? "collections"
          : item.kind === "shelf"
            ? "shelves"
            : (SIDEBAR_BUILTINS.find((b) => b.key === item.builtinKey)?.group ??
              "library")

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const groupUuid = groupUuidByKind.get(kind)!
      await trx
        .updateTable("sidebarItem")
        .set({ groupUuid })
        .where("uuid", "=", item.uuid)
        .execute()
      item.groupUuid = groupUuid
    }

    const maxPositionByGroup = new Map<string, number>()
    for (const item of liveItems) {
      if (!item.groupUuid) continue
      const current = maxPositionByGroup.get(item.groupUuid) ?? -1
      if (item.position > current)
        maxPositionByGroup.set(item.groupUuid, item.position)
    }

    const nextPosition = (groupUuid: string) => {
      const next = (maxPositionByGroup.get(groupUuid) ?? -1) + 1
      maxPositionByGroup.set(groupUuid, next)
      return next
    }

    const defaultIndexByGroup = { main: 0, library: 0 }
    for (const builtin of SIDEBAR_BUILTINS) {
      const defaultIndex = defaultIndexByGroup[builtin.group]++
      if (seenBuiltins.has(builtin.key)) continue

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const groupUuid = groupUuidByKind.get(builtin.group)!
      await trx
        .insertInto("sidebarItem")
        .values({
          userId,
          groupUuid,
          kind: "builtin",
          builtinKey: builtin.key,
          position: defaultIndex,
          hidden: 0,
        })
        .execute()
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionsGroup = groupUuidByKind.get("collections")!
    let addedCollection = false
    for (const collectionUuid of collectionUuids) {
      if (seenCollections.has(collectionUuid)) continue

      await trx
        .insertInto("sidebarItem")
        .values({
          userId,
          groupUuid: collectionsGroup,
          kind: "collection",
          collectionUuid,
          position: nextPosition(collectionsGroup),
          hidden: 0,
        })
        .execute()
      addedCollection = true
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const shelvesGroup = groupUuidByKind.get("shelves")!
    let addedShelf = false
    for (const shelfUuid of shelfUuids) {
      if (seenShelves.has(shelfUuid)) continue

      await trx
        .insertInto("sidebarItem")
        .values({
          userId,
          groupUuid: shelvesGroup,
          kind: "shelf",
          shelfUuid,
          position: nextPosition(shelvesGroup),
          hidden: 0,
        })
        .execute()
      addedShelf = true
    }

    const revealedGroups = [
      ...(addedCollection ? [collectionsGroup] : []),
      ...(addedShelf ? [shelvesGroup] : []),
    ]

    if (revealedGroups.length > 0) {
      await trx
        .updateTable("sidebarGroup")
        .set({ hidden: 0 })
        .where("uuid", "in", revealedGroups)
        .execute()
    }
  }

  if (tr) return run(tr)
  await db.transaction().execute(run)
}

export async function setSidebarGroups(
  userId: UUID,
  groups: SidebarGroupInput[],
  tr?: Transaction<DB>,
) {
  const run = async (trx: Transaction<DB>) => {
    const previousKinds = new Map<string, SidebarGroupKind>(
      (
        await trx
          .selectFrom("sidebarGroup")
          .select(["uuid", "kind"])
          .where("userId", "=", userId)
          .execute()
      )
        .filter(
          (g): g is typeof g & { kind: SidebarGroupKind } => g.kind != null,
        )
        .map((g) => [g.uuid, g.kind]),
    )

    await trx.deleteFrom("sidebarItem").where("userId", "=", userId).execute()
    await trx.deleteFrom("sidebarGroup").where("userId", "=", userId).execute()

    const seenKinds = new Set<string>()

    for (let gi = 0; gi < groups.length; gi++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const group = groups[gi]!
      const groupUuid = group.uuid ?? crypto.randomUUID()

      const requestedKind = group.kind ?? previousKinds.get(groupUuid) ?? null
      const kind =
        requestedKind &&
        SPECIAL_GROUP_KINDS.has(requestedKind) &&
        !seenKinds.has(requestedKind)
          ? requestedKind
          : null
      if (kind) seenKinds.add(kind)

      await trx
        .insertInto("sidebarGroup")
        .values({
          uuid: groupUuid,
          userId,
          name: group.name,
          kind,
          position: gi,
          hidden: group.hidden ? 1 : 0,
        })
        .execute()

      if (group.items.length === 0) continue

      await trx
        .insertInto("sidebarItem")
        .values(
          group.items.map((item, index) => ({
            userId,
            groupUuid,
            kind: item.kind,
            builtinKey: item.builtinKey ?? null,
            collectionUuid: item.collectionUuid ?? null,
            shelfUuid: item.shelfUuid ?? null,
            position: index,
            hidden: item.hidden ? 1 : 0,
          })),
        )
        .execute()
    }

    await ensureSidebarDefaults(userId, trx)
  }

  if (tr) return run(tr)
  await db.transaction().execute(run)
}
