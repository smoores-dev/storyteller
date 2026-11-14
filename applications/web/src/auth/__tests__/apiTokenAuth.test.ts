import { hash } from "argon2"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setupTestDb, type TestDbContext } from "@/__tests__/harness/testDb"
import { withHasPermission, withUser } from "@/auth/auth"
import { READING_SCOPE, createApiToken } from "@/database/apiTokens"
import { type UUID } from "@/uuid"

const PASSWORD = "correct horse battery staple"

let ctx!: TestDbContext
let userId!: UUID

beforeEach(async () => {
  ctx = setupTestDb()

  await ctx.db
    .updateTable("settings")
    .set({ value: "true" })
    .where("name", "=", "opdsEnabled")
    .execute()

  const permission = await ctx.db
    .insertInto("userPermission")
    .values({ bookRead: true, bookList: true, settingsUpdate: true })
    .returning("uuid as uuid")
    .executeTakeFirstOrThrow()

  const user = await ctx.db
    .insertInto("user")
    .values({
      username: "reader",
      name: "Reader",
      email: "reader@example.com",
      hashedPassword: await hash(PASSWORD),
      userPermissionUuid: permission.uuid,
    })
    .returning("id as id")
    .executeTakeFirstOrThrow()

  userId = user.id
})

afterEach(() => {
  ctx[Symbol.dispose]()
})

const context = { params: Promise.resolve({}) }

function request(headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/test", { headers })
}

function bearer(token: string) {
  return request({ Authorization: `Bearer ${token}` })
}

function basic(username: string, password: string) {
  return request({
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  })
}

const respondWithUser = (req: { auth: { user: { id: string } } }) =>
  Response.json({ id: req.auth.user.id })

const onUnauthorized = () => new Response("opds auth document", { status: 401 })

const readRoute = withHasPermission("bookRead")(respondWithUser)
const settingsRoute = withHasPermission("settingsUpdate")(respondWithUser)
const opdsRoute = withHasPermission("bookRead", {
  allowBasicAuth: true,
  on401: onUnauthorized,
})(respondWithUser)
const userRoute = withUser(respondWithUser)
const selfRoute = withHasPermission("manageSelf")(respondWithUser)
const opdsSelfRoute = withHasPermission("manageSelf", {
  allowBasicAuth: true,
})(respondWithUser)

describe("API tokens in withHasPermission", () => {
  it("accepts a bearer token", async () => {
    const token = await createApiToken(userId, "Script", null)

    const response = await readRoute(bearer(token), context)

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ id: userId })
  })

  it("rejects an unknown token", async () => {
    const response = await readRoute(bearer("st_nope"), context)

    expect(response?.status).toBe(401)
  })

  it("rejects an expired token", async () => {
    const token = await createApiToken(userId, "Script", null, {
      expiresAt: new Date(Date.now() - 1000),
    })

    expect((await readRoute(bearer(token), context))?.status).toBe(401)
  })

  it("forbids permissions outside the token's scope", async () => {
    const token = await createApiToken(userId, "Kobo", READING_SCOPE)

    expect((await readRoute(bearer(token), context))?.status).toBe(200)
    expect((await settingsRoute(bearer(token), context))?.status).toBe(403)
  })
})

describe("basic auth on OPDS routes", () => {
  it("accepts a token as the password", async () => {
    const token = await createApiToken(userId, "Kobo", READING_SCOPE)

    const byUsername = await opdsRoute(basic("reader", token), context)
    const byEmail = await opdsRoute(basic("Reader@example.com", token), context)

    expect(byUsername?.status).toBe(200)
    expect(byEmail?.status).toBe(200)
  })

  it("rejects a token with someone else's username", async () => {
    const token = await createApiToken(userId, "Kobo", READING_SCOPE)

    const response = await opdsRoute(basic("someone", token), context)

    expect(response?.status).toBe(401)
    expect(await response?.text()).toBe("opds auth document")
  })

  it("accepts the account password without creating a session", async () => {
    const response = await opdsRoute(basic("reader", PASSWORD), context)

    expect(response?.status).toBe(200)

    const sessions = await ctx.db.selectFrom("session").selectAll().execute()
    expect(sessions).toEqual([])
  })

  it("rejects a wrong password", async () => {
    const response = await opdsRoute(basic("reader", "wrong"), context)

    expect(response?.status).toBe(401)
  })
})

describe("API tokens in withUser", () => {
  it("accepts a full token", async () => {
    const token = await createApiToken(userId, "Script", null)

    const response = await userRoute(bearer(token), context)

    expect(response?.status).toBe(200)
  })

  it("accepts a scoped token", async () => {
    const token = await createApiToken(userId, "Kobo", READING_SCOPE)

    const response = await userRoute(bearer(token), context)

    expect(response?.status).toBe(200)
  })

  it("rejects an unknown token", async () => {
    const response = await userRoute(bearer("st_nope"), context)

    expect(response?.status).toBe(401)
  })
})

describe("manageSelf", () => {
  it("is held by a full token", async () => {
    const token = await createApiToken(userId, "Script", null)

    expect((await selfRoute(bearer(token), context))?.status).toBe(200)
  })

  it("is not held by a scoped token", async () => {
    const token = await createApiToken(userId, "Kobo", READING_SCOPE)

    expect((await selfRoute(bearer(token), context))?.status).toBe(403)
  })

  it("is not held by password basic auth", async () => {
    const response = await opdsSelfRoute(basic("reader", PASSWORD), context)

    expect(response?.status).toBe(403)
  })

  it("is held by a session", async () => {
    const sessionToken = crypto.randomUUID()
    await ctx.db
      .insertInto("session")
      .values({
        userId,
        sessionToken,
        expires: new Date(Date.now() + 60_000),
      })
      .execute()

    expect((await selfRoute(bearer(sessionToken), context))?.status).toBe(200)
  })
})
