import assert from "node:assert"

import { describe, it } from "vitest"

import { getSetting, getSettings, updateSettings } from "@/database/settings"
import { encryptSecret, isEncrypted } from "@/secrets"

import { setupTestDb } from "./harness/testDb"

function storedValue(ctx: ReturnType<typeof setupTestDb>, name: string) {
  const row = ctx.sqlite
    .prepare(`SELECT value FROM settings WHERE name = ?`)
    .get(name) as { value: string } | undefined

  return row ? (JSON.parse(row.value) as unknown) : undefined
}

describe("settings encryption", () => {
  it("stores api keys encrypted but reads them back in the clear", async () => {
    using ctx = setupTestDb()

    const settings = await getSettings()
    await updateSettings({
      ...settings,
      openAiApiKey: "sk-test-value",
      smtpPassword: "hunter2",
    })

    const storedKey = storedValue(ctx, "openAiApiKey")
    const storedPassword = storedValue(ctx, "smtpPassword")

    assert.ok(typeof storedKey === "string" && isEncrypted(storedKey))
    assert.ok(!storedKey.includes("sk-test-value"))
    assert.ok(typeof storedPassword === "string" && isEncrypted(storedPassword))
    assert.ok(!storedPassword.includes("hunter2"))

    const readBack = await getSettings()
    assert.strictEqual(readBack.openAiApiKey, "sk-test-value")
    assert.strictEqual(readBack.smtpPassword, "hunter2")
    assert.strictEqual(await getSetting("openAiApiKey"), "sk-test-value")
  })

  it("leaves non-secret settings in the clear", async () => {
    using ctx = setupTestDb()

    const settings = await getSettings()
    await updateSettings({ ...settings, libraryName: "The Library of Babel" })

    assert.strictEqual(storedValue(ctx, "libraryName"), "The Library of Babel")
  })

  it("encrypts auth provider client secrets", async () => {
    using ctx = setupTestDb()

    const settings = await getSettings()
    await updateSettings({
      ...settings,
      authProviders: [
        {
          kind: "custom",
          name: "Keycloak",
          clientId: "storyteller",
          clientSecret: "very-secret",
          type: "oidc",
          issuer: "https://example.com",
        },
      ],
    })

    const stored = storedValue(ctx, "authProviders") as {
      clientId: string
      clientSecret: string
    }[]

    assert.ok(isEncrypted(stored[0]!.clientSecret))
    assert.strictEqual(stored[0]!.clientId, "storyteller")

    const readBack = await getSettings()
    assert.strictEqual(readBack.authProviders[0]?.clientSecret, "very-secret")
  })

  it("keeps an undecryptable secret intact across a stale save", async () => {
    using ctx = setupTestDb()

    const foreign = await encryptSecret("from-a-different-secret-key")
    const tampered = foreign.slice(0, -8) + "AAAAAAAA"

    ctx.sqlite
      .prepare(`UPDATE settings SET value = ? WHERE name = ?`)
      .run(JSON.stringify(tampered), "openAiApiKey")

    const settings = await getSettings()
    assert.strictEqual(settings.openAiApiKey, "")

    await updateSettings(settings)

    assert.strictEqual(storedValue(ctx, "openAiApiKey"), tampered)
  })

  it("does not re-encrypt on an unchanged save", async () => {
    using ctx = setupTestDb()

    const settings = await getSettings()
    await updateSettings({ ...settings, openAiApiKey: "sk-test-value" })
    const first = storedValue(ctx, "openAiApiKey")

    await updateSettings(await getSettings())
    assert.strictEqual(storedValue(ctx, "openAiApiKey"), first)
  })
})
