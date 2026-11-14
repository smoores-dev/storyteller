import { randomUUID } from "node:crypto"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setupTestDb, type TestDbContext } from "@/__tests__/harness/testDb"
import {
  DELETE as deleteBookRating,
  GET as getBookRating,
  PUT as setBookRating,
} from "@/app/api/v2/books/[bookId]/rating/route"
import { DELETE as unlinkAccount } from "@/app/api/v2/user/accounts/[provider]/route"
import { GET as listRatings } from "@/app/api/v2/user/ratings/route"
import {
  GET as getProfile,
  PUT as updateProfile,
} from "@/app/api/v2/user/route"
import {
  GET as getUserSettings,
  PUT as updateUserSettings,
} from "@/app/api/v2/user/settings/route"
import { DELETE as revokeToken } from "@/app/api/v2/user/tokens/[uuid]/route"
import {
  GET as listTokens,
  POST as createToken,
} from "@/app/api/v2/user/tokens/route"
import { GET as validate } from "@/app/api/v2/validate/route"
import {
  READING_SCOPE,
  createApiToken,
  getApiTokens,
} from "@/database/apiTokens"
import { type UUID } from "@/uuid"

let ctx!: TestDbContext
let userId!: UUID
let otherUserId!: UUID
let sessionToken!: string

async function insertUser(username: string) {
  const permission = await ctx.db
    .insertInto("userPermission")
    .values({ bookRead: true })
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

async function linkAccount(user: UUID, provider: string) {
  await ctx.db
    .insertInto("account")
    .values({
      userId: user,
      type: provider === "credentials" ? "credentials" : "oidc",
      provider,
      providerAccountId: `${provider}-${user}`,
    })
    .execute()
}

beforeEach(async () => {
  ctx = setupTestDb()

  userId = await insertUser("reader")
  otherUserId = await insertUser("other")

  sessionToken = randomUUID()
  await ctx.db
    .insertInto("session")
    .values({
      userId,
      sessionToken,
      expires: new Date(Date.now() + 60_000),
    })
    .execute()
})

afterEach(() => {
  ctx[Symbol.dispose]()
})

function call(method: string, token: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v2/user", {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
}

function params<T>(value: T) {
  return { params: Promise.resolve(value) }
}

describe("PUT /api/v2/user", () => {
  it("updates the profile", async () => {
    const response = await updateProfile(
      call("PUT", sessionToken, { name: "Renamed" }),
      params({}),
    )

    expect(response?.status).toBe(200)
    const user = await ctx.db
      .selectFrom("user")
      .select("name")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow()
    expect(user.name).toBe("Renamed")
  })

  it("rejects fields outside the profile", async () => {
    const response = await updateProfile(
      call("PUT", sessionToken, { userPermissionUuid: randomUUID() }),
      params({}),
    )

    expect(response?.status).toBe(400)
  })

  it("rejects an invalid email", async () => {
    const response = await updateProfile(
      call("PUT", sessionToken, { email: "not an email" }),
      params({}),
    )

    expect(response?.status).toBe(400)
  })

  it("trims the email before checking it", async () => {
    const response = await updateProfile(
      call("PUT", sessionToken, { email: " reader@sub.example.com " }),
      params({}),
    )

    expect(response?.status).toBe(200)
    const user = await ctx.db
      .selectFrom("user")
      .select("email")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow()
    expect(user.email).toBe("reader@sub.example.com")
  })

  it("stores a hashed password", async () => {
    await updateProfile(
      call("PUT", sessionToken, { password: "hunter2" }),
      params({}),
    )

    const user = await ctx.db
      .selectFrom("user")
      .select("hashedPassword")
      .where("id", "=", userId)
      .executeTakeFirstOrThrow()
    expect(user.hashedPassword).toMatch(/^\$argon2/)
  })

  it("refuses API tokens", async () => {
    const token = await createApiToken(userId, "Script", null)

    const response = await updateProfile(
      call("PUT", token, { name: "Renamed" }),
      params({}),
    )

    expect(response?.status).toBe(403)
  })
})

describe("/api/v2/user/tokens", () => {
  it("creates and lists tokens", async () => {
    const created = await createToken(
      call("POST", sessionToken, {
        name: "Kobo",
        access: "reading",
        expiration: "30d",
      }),
      params({}),
    )

    expect(created?.status).toBe(201)
    const body = (await created?.json()) as { token: string }
    expect(body.token).toMatch(/^st_/)

    const listed = await listTokens(call("GET", sessionToken), params({}))
    const tokens = (await listed?.json()) as Array<{
      name: string
      expiresAt: string | null
    }>
    expect(tokens.map((t) => t.name)).toEqual(["Kobo"])
    expect(tokens[0]?.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("does not let a full token mint tokens", async () => {
    const token = await createApiToken(userId, "Script", null)

    const response = await createToken(
      call("POST", token, {
        name: "Escalate",
        access: "full",
        expiration: "never",
      }),
      params({}),
    )

    expect(response?.status).toBe(403)
  })

  it("only revokes the caller's own tokens", async () => {
    await createApiToken(otherUserId, "Theirs", null)
    const [theirs] = await getApiTokens(otherUserId)

    const response = await revokeToken(
      call("DELETE", sessionToken),
      params({ uuid: theirs!.uuid }),
    )

    expect(response?.status).toBe(404)
    expect(await getApiTokens(otherUserId)).toHaveLength(1)
  })
})

describe("DELETE /api/v2/user/accounts/[provider]", () => {
  it("unlinks a provider when another sign-in remains", async () => {
    await linkAccount(userId, "credentials")
    await linkAccount(userId, "github")

    const response = await unlinkAccount(
      call("DELETE", sessionToken),
      params({ provider: "github" }),
    )

    expect(response?.status).toBe(204)
    const providers = await ctx.db
      .selectFrom("account")
      .select("provider")
      .where("userId", "=", userId)
      .execute()
    expect(providers.map((p) => p.provider)).toEqual(["credentials"])
  })

  it("refuses to remove the last way to sign in", async () => {
    await linkAccount(userId, "github")

    const response = await unlinkAccount(
      call("DELETE", sessionToken),
      params({ provider: "github" }),
    )

    expect(response?.status).toBe(409)
  })

  it("leaves other users' accounts alone", async () => {
    await linkAccount(otherUserId, "github")
    await linkAccount(otherUserId, "credentials")

    const response = await unlinkAccount(
      call("DELETE", sessionToken),
      params({ provider: "github" }),
    )

    expect(response?.status).toBe(404)
    const remaining = await ctx.db
      .selectFrom("account")
      .select("provider")
      .where("userId", "=", otherUserId)
      .execute()
    expect(remaining).toHaveLength(2)
  })
})

describe("own-user routes", () => {
  const bookId = randomUUID()

  type Route = (token: string) => ReturnType<typeof getProfile>

  const routes: Array<[string, Route]> = [
    ["GET /user", (t) => getProfile(call("GET", t), params({}))],
    ["GET /user/settings", (t) => getUserSettings(call("GET", t), params({}))],
    [
      "PUT /user/settings",
      (t) => updateUserSettings(call("PUT", t, {}), params({})),
    ],
    ["GET /user/ratings", (t) => listRatings(call("GET", t), params({}))],
    [
      "GET /books/[bookId]/rating",
      (t) => getBookRating(call("GET", t), params({ bookId })),
    ],
    [
      "PUT /books/[bookId]/rating",
      (t) => setBookRating(call("PUT", t, {}), params({ bookId })),
    ],
    [
      "DELETE /books/[bookId]/rating",
      (t) => deleteBookRating(call("DELETE", t), params({ bookId })),
    ],
  ]

  const sessionOnlyRoutes: Array<[string, Route]> = [
    ["PUT /user", (t) => updateProfile(call("PUT", t, {}), params({}))],
    ["GET /user/tokens", (t) => listTokens(call("GET", t), params({}))],
    ["POST /user/tokens", (t) => createToken(call("POST", t, {}), params({}))],
    [
      "DELETE /user/tokens/[uuid]",
      (t) => revokeToken(call("DELETE", t), params({ uuid: randomUUID() })),
    ],
    [
      "DELETE /user/accounts/[provider]",
      (t) => unlinkAccount(call("DELETE", t), params({ provider: "github" })),
    ],
  ]

  async function status(route: Route, token: string) {
    return (await route(token))?.status
  }

  it.each(routes)(
    "%s works with a session and a full token",
    async (_, route) => {
      const fullToken = await createApiToken(userId, "Script", null)

      expect([401, 403]).not.toContain(await status(route, sessionToken))
      expect([401, 403]).not.toContain(await status(route, fullToken))
    },
  )

  it.each([...routes, ...sessionOnlyRoutes])(
    "%s refuses a reading token",
    async (_, route) => {
      const readingToken = await createApiToken(userId, "Kobo", READING_SCOPE)

      expect(await status(route, readingToken)).toBe(403)
    },
  )

  it.each(routes)("%s refuses an unknown token", async (_, route) => {
    expect(await status(route, "st_nope")).toBe(401)
  })

  it("lets a reading token validate itself", async () => {
    const readingToken = await createApiToken(userId, "Kobo", READING_SCOPE)

    expect(
      await status((t) => validate(call("GET", t), params({})), readingToken),
    ).toBe(204)
  })
})
