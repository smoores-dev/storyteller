import assert from "node:assert"

import { describe, it } from "vitest"

import { Feed } from "./index.ts"
import rawCatalog from "./test-catalog.json.ts"
import { parseFeed, validateFeed } from "./validate/index.ts"

describe("OPDS", () => {
  it("validates a OPDS 2.0 catalog", () => {
    assert.strictEqual(validateFeed(rawCatalog), null)
  })

  it("parses a catalog into a Feed and round-trips it", () => {
    const result = parseFeed(rawCatalog)
    assert.ok(result.ok, "expected a valid parse")

    assert.ok(result.value instanceof Feed)
    // serializing the model back out must still validate
    assert.strictEqual(validateFeed(result.value.serialize()), null)
  })

  it("reports located errors instead of returning undefined", () => {
    const broken = structuredClone(rawCatalog) as { links: { href: string }[] }
    // drop the required href on the first link
    delete (broken.links[0] as Partial<{ href: string }>).href

    const result = parseFeed(broken)
    assert.ok(!result.ok, "expected a failed parse")

    assert.ok(result.errors.length > 0)
    assert.ok(
      result.errors.some((e) => e.path.startsWith("/links")),
      `expected an error pathed into /links, got ${JSON.stringify(result.errors)}`,
    )
  })

  it("skips validation when no validator is passed", () => {
    // construction-only path: trusts the input, never touches AJV
    const result = Feed.deserialize(rawCatalog)
    assert.ok(result.ok)
  })
})
