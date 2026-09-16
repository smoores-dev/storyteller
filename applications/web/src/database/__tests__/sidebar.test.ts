import assert from "node:assert"

import { type Database } from "better-sqlite3"
import { describe, it } from "vitest"

import { type TestDbContext, setupTestDb } from "@/__tests__/harness/testDb"
import {
  ensureSidebarDefaults,
  getSidebarGroups,
  setSidebarGroups,
} from "@/database/sidebar"
import { type UUID } from "@/uuid"

const userId = "11111111-1111-1111-1111-111111111111" as UUID

function seedUser(sqlite: Database) {
  sqlite
    .prepare(`INSERT INTO user_permission (uuid, book_list) VALUES (?, 1)`)
    .run("22222222-2222-2222-2222-222222222222")
  sqlite
    .prepare(
      `INSERT INTO "user" (id, user_permission_uuid, email) VALUES (?, ?, ?)`,
    )
    .run(userId, "22222222-2222-2222-2222-222222222222", "t@example.com")
}

function seedShelf(ctx: TestDbContext, name: string): string {
  const uuid = crypto.randomUUID()
  ctx.sqlite
    .prepare(`INSERT INTO shelf (uuid, user_id, name) VALUES (?, ?, ?)`)
    .run(uuid, userId, name)
  return uuid
}

async function shelvesGroup() {
  const groups = await getSidebarGroups(userId)
  const group = groups.find((g) => g.kind === "shelves")
  assert.ok(group)
  return group
}

async function hideShelfItem(shelfUuid: string) {
  const groups = await getSidebarGroups(userId)
  await setSidebarGroups(
    userId,
    groups.map((group) => ({
      uuid: group.uuid,
      name: group.name,
      kind: group.kind,
      hidden: group.hidden,
      items: group.items.map((item) => ({
        kind: item.kind,
        builtinKey: item.builtinKey,
        collectionUuid: item.collectionUuid,
        shelfUuid: item.shelfUuid,
        hidden: item.shelfUuid === shelfUuid ? true : item.hidden,
      })),
    })),
  )
}

async function setShelvesGroupHidden(hidden: boolean) {
  const groups = await getSidebarGroups(userId)
  await setSidebarGroups(
    userId,
    groups.map((group) => ({
      uuid: group.uuid,
      name: group.name,
      kind: group.kind,
      hidden: group.kind === "shelves" ? hidden : group.hidden,
      items: group.items.map((item) => ({
        kind: item.kind,
        builtinKey: item.builtinKey,
        collectionUuid: item.collectionUuid,
        shelfUuid: item.shelfUuid,
        hidden: item.hidden,
      })),
    })),
  )
}

describe("sidebar section visibility", () => {
  it("hides a section without touching the items' own hidden flags", async () => {
    using ctx = setupTestDb()
    seedUser(ctx.sqlite)

    const kept = seedShelf(ctx, "Kept")
    const explicitlyHidden = seedShelf(ctx, "Explicitly hidden")
    await ensureSidebarDefaults(userId)
    await hideShelfItem(explicitlyHidden)

    await setShelvesGroupHidden(true)

    const group = await shelvesGroup()
    assert.equal(group.hidden, true)
    assert.equal(
      group.items.find((i) => i.shelfUuid === kept)?.hidden,
      false,
      "a section-level hide must not mark its items hidden",
    )
    assert.equal(
      group.items.find((i) => i.shelfUuid === explicitlyHidden)?.hidden,
      true,
    )
  })

  it("brings the section back when a new shelf appears, restoring only the items the user never hid", async () => {
    using ctx = setupTestDb()
    seedUser(ctx.sqlite)

    const kept = seedShelf(ctx, "Kept")
    const explicitlyHidden = seedShelf(ctx, "Explicitly hidden")
    await ensureSidebarDefaults(userId)
    await hideShelfItem(explicitlyHidden)
    await setShelvesGroupHidden(true)

    const added = seedShelf(ctx, "Brand new")
    await ensureSidebarDefaults(userId)

    const group = await shelvesGroup()
    assert.equal(group.hidden, false, "a new shelf reveals its section again")

    const visible = group.items
      .filter((item) => !item.hidden)
      .map((item) => item.shelfUuid)

    assert.deepEqual(new Set(visible), new Set([kept, added]))
    assert.equal(
      group.items.find((i) => i.shelfUuid === explicitlyHidden)?.hidden,
      true,
      "an explicitly hidden shelf stays hidden",
    )
  })

  it("leaves a hidden section alone when nothing new was added", async () => {
    using ctx = setupTestDb()
    seedUser(ctx.sqlite)

    seedShelf(ctx, "Kept")
    await ensureSidebarDefaults(userId)
    await setShelvesGroupHidden(true)

    await ensureSidebarDefaults(userId)

    assert.equal((await shelvesGroup()).hidden, true)
  })
})
