import assert from "node:assert"

import { describe, it } from "vitest"

import { setupTestDb } from "@/__tests__/harness/testDb"
import {
  readHardcoverToken,
  saveHardcoverToken,
} from "@/database/providerTokens"
import { getSettings } from "@/database/settings"

describe("hardcover token storage", () => {
  it("stores the token encrypted and keeps it out of the settings payload", async () => {
    using ctx = setupTestDb()

    await saveHardcoverToken("hc-secret-token")

    const row = ctx.sqlite
      .prepare<[], { value: string }>(
        "SELECT value FROM settings WHERE name = 'hardcoverApiToken'",
      )
      .get()
    assert.ok(row)
    assert.ok(!row.value.includes("hc-secret-token"))

    const { token, status } = await readHardcoverToken()
    assert.strictEqual(token, "hc-secret-token")
    assert.deepStrictEqual(status, {
      tokenSet: true,
      source: "database",
      locked: false,
      unreadable: false,
    })

    const settings = await getSettings()
    assert.ok(!("hardcoverApiToken" in settings))
    assert.ok(!JSON.stringify(settings).includes("hc-secret-token"))
  })

  it("forgets the token when it is cleared", async () => {
    using _ctx = setupTestDb()

    await saveHardcoverToken("hc-secret-token")
    await saveHardcoverToken(null)

    const { status } = await readHardcoverToken()
    assert.strictEqual(status.source === "database", false)
    assert.strictEqual(status.unreadable, false)
  })

  it("reports a token that no longer decrypts", async () => {
    using ctx = setupTestDb()

    ctx.sqlite
      .prepare("INSERT INTO settings (name, value) VALUES (?, ?)")
      .run("hardcoverApiToken", JSON.stringify("enc:v1:bad:bad:bad"))

    const { status } = await readHardcoverToken()
    assert.strictEqual(status.unreadable, true)
    assert.notStrictEqual(status.source, "database")
  })
})
