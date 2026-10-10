import assert from "node:assert"

import { describe, it } from "vitest"

import { normalizeLanguage } from "@/metadata/language"

describe("normalizeLanguage", () => {
  it("maps the provider spellings we actually see", () => {
    assert.strictEqual(normalizeLanguage("english"), "en")
    assert.strictEqual(normalizeLanguage("English"), "en")
    assert.strictEqual(normalizeLanguage("french"), "fr")
  })

  it("keeps a region when the name carries one", () => {
    assert.strictEqual(normalizeLanguage("American English"), "en-US")
    assert.strictEqual(normalizeLanguage("British English"), "en-GB")
    assert.strictEqual(normalizeLanguage("Brazilian Portuguese"), "pt-BR")
  })

  it("understands endonyms", () => {
    assert.strictEqual(normalizeLanguage("Nederlands"), "nl")
  })

  it("canonicalizes tags that are already codes", () => {
    assert.strictEqual(normalizeLanguage("EN"), "en")
    assert.strictEqual(normalizeLanguage("en-us"), "en-US")
    assert.strictEqual(normalizeLanguage("en_US"), "en-US")
    assert.strictEqual(normalizeLanguage("de-DE"), "de-DE")
  })

  it("passes through anything it cannot place", () => {
    assert.strictEqual(normalizeLanguage("Klingon"), "Klingon")
  })

  it("treats blank input as no language", () => {
    assert.strictEqual(normalizeLanguage(""), null)
    assert.strictEqual(normalizeLanguage("   "), null)
    assert.strictEqual(normalizeLanguage(null), null)
    assert.strictEqual(normalizeLanguage(undefined), null)
  })
})
