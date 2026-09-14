import assert from "node:assert"

import { describe, it } from "vitest"

import { setupTestDb } from "@/__tests__/harness/testDb"
import { createAdminUser } from "@/database/users"
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  requestPasswordReset,
} from "@/passwordReset"

describe("password reset tokens", () => {
  it("returns the email for a valid token and consumes it (single use)", async () => {
    using _db = setupTestDb()

    const token = await createPasswordResetToken("user@example.com")

    const result = await consumePasswordResetToken(token)
    assert.deepStrictEqual(result, { email: "user@example.com" })

    // Single-use: the same token can't be redeemed twice.
    const again = await consumePasswordResetToken(token)
    assert.strictEqual(again, null)
  })

  it("uses the default 60-minute expiry", async () => {
    using _db = setupTestDb()

    const before = Date.now()
    const token = await createPasswordResetToken("ttl@example.com")

    const row = await _db.db
      .selectFrom("verificationToken")
      .selectAll()
      .where("token", "=", token)
      .executeTakeFirstOrThrow()

    const ttlMinutes = (new Date(row.expires).getTime() - before) / 60000
    assert.ok(
      Math.abs(ttlMinutes - 60) < 1,
      `expected ~60 minute expiry, got ${ttlMinutes}`,
    )
  })

  it("returns null for an unknown token", async () => {
    using _db = setupTestDb()

    assert.strictEqual(await consumePasswordResetToken("does-not-exist"), null)
  })

  it("returns null for an expired token and consumes it", async () => {
    using _db = setupTestDb()

    await _db.db
      .insertInto("verificationToken")
      .values({
        identifier: "password-reset:old@example.com",
        token: "expired-token",
        expires: new Date(Date.now() - 1000),
      })
      .execute()

    assert.strictEqual(await consumePasswordResetToken("expired-token"), null)

    const row = await _db.db
      .selectFrom("verificationToken")
      .selectAll()
      .where("token", "=", "expired-token")
      .executeTakeFirst()
    assert.strictEqual(row, undefined, "expired token should be deleted")
  })

  it("ignores verification tokens that aren't password resets", async () => {
    using _db = setupTestDb()

    await _db.db
      .insertInto("verificationToken")
      .values({
        identifier: "other@example.com",
        token: "other-token",
        expires: new Date(Date.now() + 60 * 60 * 1000),
      })
      .execute()

    assert.strictEqual(await consumePasswordResetToken("other-token"), null)

    // Non-reset tokens must be left untouched.
    const row = await _db.db
      .selectFrom("verificationToken")
      .selectAll()
      .where("token", "=", "other-token")
      .executeTakeFirst()
    assert.ok(row, "unrelated verification token should not be deleted")
  })
})

describe("requestPasswordReset", () => {
  it("creates a reset token for a matching account", async () => {
    using _db = setupTestDb()
    await createAdminUser("alice", "Alice", "alice@example.com", "hashed")

    await requestPasswordReset("alice@example.com")

    const rows = await _db.db
      .selectFrom("verificationToken")
      .selectAll()
      .where("identifier", "=", "password-reset:alice@example.com")
      .execute()
    assert.strictEqual(rows.length, 1)
  })

  it("resolves a username to the account email", async () => {
    using _db = setupTestDb()
    await createAdminUser("alice", "Alice", "alice@example.com", "hashed")

    await requestPasswordReset("alice")

    const rows = await _db.db
      .selectFrom("verificationToken")
      .selectAll()
      .where("identifier", "=", "password-reset:alice@example.com")
      .execute()
    assert.strictEqual(rows.length, 1)
  })

  it("does nothing for an unknown account", async () => {
    using _db = setupTestDb()
    await createAdminUser("alice", "Alice", "alice@example.com", "hashed")

    await requestPasswordReset("nobody@example.com")

    const rows = await _db.db
      .selectFrom("verificationToken")
      .selectAll()
      .execute()
    assert.strictEqual(rows.length, 0)
  })

  it("doesn't issue a second token while one is still valid (cooldown)", async () => {
    using _db = setupTestDb()
    await createAdminUser("alice", "Alice", "alice@example.com", "hashed")

    await requestPasswordReset("alice@example.com")
    await requestPasswordReset("alice@example.com")

    const rows = await _db.db
      .selectFrom("verificationToken")
      .selectAll()
      .where("identifier", "=", "password-reset:alice@example.com")
      .execute()
    assert.strictEqual(rows.length, 1)
  })
})
