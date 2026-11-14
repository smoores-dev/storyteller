import { createHash } from "node:crypto"

import { addDays } from "date-fns"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setupTestDb, type TestDbContext } from "@/__tests__/harness/testDb"
import {
  READING_SCOPE,
  apiTokenExpiresAt,
  createApiToken,
  deleteApiToken,
  getApiTokenUser,
  getApiTokens,
  isApiToken,
} from "@/database/apiTokens"
import { toIsoDateTimeString } from "@/dates"
import { type UUID } from "@/uuid"

let ctx!: TestDbContext
let userId!: UUID

async function createUser(username: string) {
  const permission = await ctx.db
    .insertInto("userPermission")
    .values({ bookRead: true, bookList: true, settingsUpdate: true })
    .returning("uuid as uuid")
    .executeTakeFirstOrThrow()

  const user = await ctx.db
    .insertInto("user")
    .values({
      username,
      name: username,
      email: `${username}@example.com`,
      userPermissionUuid: permission.uuid,
    })
    .returning("id as id")
    .executeTakeFirstOrThrow()

  return user.id
}

beforeEach(async () => {
  ctx = setupTestDb()
  userId = await createUser("reader")
})

afterEach(() => {
  ctx[Symbol.dispose]()
})

describe("api tokens", () => {
  it("resolves a full token to the user with all their permissions", async () => {
    const token = await createApiToken(userId, "Script", null)

    expect(isApiToken(token)).toBe(true)

    const resolved = await getApiTokenUser(token)

    expect(resolved?.user.id).toBe(userId)
    expect(resolved?.scope).toBeNull()
    expect(resolved?.user.permissions.settingsUpdate).toBe(true)
  })

  it("limits a scoped token to the scope", async () => {
    const token = await createApiToken(userId, "Kobo", READING_SCOPE)

    const resolved = await getApiTokenUser(token)

    expect(resolved?.scope).toEqual(READING_SCOPE)
    expect(resolved?.user.permissions.bookRead).toBe(true)
    expect(resolved?.user.permissions.bookList).toBe(false)
    expect(resolved?.user.permissions.settingsUpdate).toBe(false)
  })

  it("never grants a scoped permission the user lacks", async () => {
    const token = await createApiToken(userId, "Admin", ["userDelete"])

    const resolved = await getApiTokenUser(token)

    expect(resolved?.user.permissions.userDelete).toBe(false)
  })

  it("stores the token as sha256 of its md5", async () => {
    const token = await createApiToken(userId, "Kobo", null)

    const row = await ctx.db
      .selectFrom("apiToken")
      .select(["tokenHash", "tokenStart"])
      .executeTakeFirstOrThrow()

    const md5 = createHash("md5").update(token).digest("hex")
    expect(row.tokenHash).toBe(createHash("sha256").update(md5).digest("hex"))
    expect(token.startsWith(row.tokenStart)).toBe(true)
    expect(row.tokenStart.length).toBeLessThan(token.length)
  })

  it("rejects unknown and revoked tokens", async () => {
    const token = await createApiToken(userId, "Kobo", null)
    const [summary] = await getApiTokens(userId)

    expect(await getApiTokenUser(`${token}x`)).toBeNull()

    await deleteApiToken(userId, summary!.uuid)

    expect(await getApiTokenUser(token)).toBeNull()
  })

  it("rejects a token once it has expired", async () => {
    const token = await createApiToken(userId, "Kobo", null, {
      expiresAt: new Date(Date.now() - 1000),
    })

    expect(await getApiTokenUser(token)).toBeNull()
  })

  it("accepts a token until it expires and lists when it does", async () => {
    const expiresAt = apiTokenExpiresAt("30d")
    const token = await createApiToken(userId, "Kobo", null, { expiresAt })

    expect(await getApiTokenUser(token)).not.toBeNull()

    const [summary] = await getApiTokens(userId)
    expect(summary?.expiresAt).toBe(toIsoDateTimeString(expiresAt))
  })

  it("pushes an idle timeout forward each time the token is used", async () => {
    const token = await createApiToken(userId, "OPDS", READING_SCOPE, {
      idleTimeoutDays: 365,
    })

    await ctx.db
      .updateTable("apiToken")
      .set({ expiresAt: new Date(Date.now() + 60_000) })
      .execute()

    expect(await getApiTokenUser(token)).not.toBeNull()

    const [summary] = await getApiTokens(userId)
    expect(summary?.idleTimeoutDays).toBe(365)
    expect(new Date(summary!.expiresAt!).valueOf()).toBeGreaterThan(
      addDays(new Date(), 364).valueOf(),
    )
  })

  it("rejects an idle token that went unused past its timeout", async () => {
    const token = await createApiToken(userId, "OPDS", READING_SCOPE, {
      idleTimeoutDays: 365,
    })

    await ctx.db
      .updateTable("apiToken")
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .execute()

    expect(await getApiTokenUser(token)).toBeNull()
  })

  it("turns an expiration choice into a date", () => {
    const now = new Date("2026-01-01T00:00:00Z")

    expect(apiTokenExpiresAt("7d", now)).toEqual(
      new Date("2026-01-08T00:00:00Z"),
    )
    expect(apiTokenExpiresAt("1y", now)).toEqual(
      new Date("2027-01-01T00:00:00Z"),
    )
    expect(apiTokenExpiresAt("never", now)).toBeNull()
  })

  it("only revokes the owner's tokens", async () => {
    const otherId = await createUser("other")
    const token = await createApiToken(userId, "Kobo", null)
    const [summary] = await getApiTokens(userId)

    await deleteApiToken(otherId, summary!.uuid)

    expect(await getApiTokenUser(token)).not.toBeNull()
  })

  it("records when a token was last used", async () => {
    const token = await createApiToken(userId, "Kobo", null)

    expect((await getApiTokens(userId))[0]?.lastUsedAt).toBeNull()

    await getApiTokenUser(token)

    const [summary] = await getApiTokens(userId)
    expect(summary?.lastUsedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(summary?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })

  it("lists only the user's own tokens", async () => {
    const otherId = await createUser("other")
    await createApiToken(userId, "Mine", null)
    await createApiToken(otherId, "Theirs", null)

    const tokens = await getApiTokens(userId)

    expect(tokens.map((token) => token.name)).toEqual(["Mine"])
    expect(Object.keys(tokens[0]!)).not.toContain("tokenHash")
  })
})
