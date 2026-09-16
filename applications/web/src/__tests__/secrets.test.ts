import assert from "node:assert"

import { describe, it } from "vitest"

import { decryptSecret, encryptSecret, isEncrypted } from "@/secrets"

describe("secret encryption", () => {
  it("round trips a secret", async () => {
    const encrypted = await encryptSecret("hunter2")

    assert.ok(isEncrypted(encrypted))
    assert.ok(!encrypted.includes("hunter2"))
    assert.strictEqual(await decryptSecret(encrypted), "hunter2")
  })

  it("produces a different ciphertext each time", async () => {
    const a = await encryptSecret("hunter2")
    const b = await encryptSecret("hunter2")

    assert.notStrictEqual(a, b)
    assert.strictEqual(await decryptSecret(a), await decryptSecret(b))
  })

  it("passes through values that are not encrypted", async () => {
    assert.strictEqual(await decryptSecret("plaintext"), "plaintext")
    assert.strictEqual(await encryptSecret(""), "")
  })

  it("does not double encrypt", async () => {
    const once = await encryptSecret("hunter2")
    assert.strictEqual(await encryptSecret(once), once)
  })

  it("round trips unicode and long values", async () => {
    const value = `${"🔐".repeat(64)} ${"a".repeat(4096)}`
    assert.strictEqual(await decryptSecret(await encryptSecret(value)), value)
  })

  it("rejects a tampered ciphertext instead of returning garbage", async () => {
    const encrypted = await encryptSecret("hunter2")
    const [iv, tag, ciphertext] = encrypted.slice("enc:v1:".length).split(":")

    assert.ok(ciphertext)
    const flipped = Buffer.from(ciphertext, "base64url")
    flipped.writeUInt8(flipped.readUInt8(0) ^ 0xff, 0)

    const tampered = `enc:v1:${iv}:${tag}:${flipped.toString("base64url")}`

    assert.strictEqual(await decryptSecret(tampered), null)
  })

  it("returns null for a malformed value", async () => {
    assert.strictEqual(await decryptSecret("enc:v1:nope"), null)
  })
})
