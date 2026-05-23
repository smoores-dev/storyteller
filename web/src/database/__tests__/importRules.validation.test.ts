import assert from "node:assert"
import { describe, it } from "node:test"

import { type ImportRule } from "@/database/importRules"
import {
  normalizeRulePath,
  validateWatchRulePath,
} from "@/database/importRules.validation"
import { type UUID } from "@/uuid"

function rule(
  uuid: string,
  kind: ImportRule["kind"],
  path: string,
): Pick<ImportRule, "uuid" | "kind" | "path"> {
  return { uuid: uuid as UUID, kind, path }
}

void describe("normalizeRulePath", () => {
  void it("strips trailing slashes", () => {
    assert.strictEqual(normalizeRulePath("/library/"), "/library")
  })

  void it("collapses double slashes and dot segments", () => {
    assert.strictEqual(normalizeRulePath("/library//a/./b"), "/library/a/b")
  })

  void it("resolves parent segments", () => {
    assert.strictEqual(normalizeRulePath("/library/a/../b"), "/library/b")
  })

  void it("keeps relative paths relative", () => {
    assert.strictEqual(normalizeRulePath("library/a"), "library/a")
  })

  void it("normalizes backslashes to forward slashes", () => {
    assert.strictEqual(normalizeRulePath("\\library\\a"), "/library/a")
  })
})

void describe("validateWatchRulePath", () => {
  void it("accepts a brand-new path against an empty rule set", () => {
    const result = validateWatchRulePath({
      path: "/library/a",
      existingRules: [],
    })
    assert.deepStrictEqual(result, { ok: true })
  })

  void it("rejects exact duplicates", () => {
    const result = validateWatchRulePath({
      path: "/library/a",
      existingRules: [rule("u1", "watch", "/library/a")],
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error, "duplicate")
    assert.strictEqual(result.conflictWith, "u1")
  })

  void it("rejects a child of an existing watch rule", () => {
    const result = validateWatchRulePath({
      path: "/library/a/sub",
      existingRules: [rule("u1", "watch", "/library/a")],
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error, "child-of")
    assert.strictEqual(result.conflictWith, "u1")
  })

  void it("rejects a parent of an existing watch rule", () => {
    const result = validateWatchRulePath({
      path: "/library",
      existingRules: [rule("u1", "watch", "/library/a")],
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error, "parent-of")
    assert.strictEqual(result.conflictWith, "u1")
  })

  void it("allows sibling paths", () => {
    const result = validateWatchRulePath({
      path: "/library/b",
      existingRules: [rule("u1", "watch", "/library/a")],
    })
    assert.deepStrictEqual(result, { ok: true })
  })

  void it("ignores overlap with ignore rules", () => {
    const result = validateWatchRulePath({
      path: "/library/a",
      existingRules: [rule("u1", "ignore", "/library")],
    })
    assert.deepStrictEqual(result, { ok: true })
  })

  void it("rejects a child of a forbidden root", () => {
    const result = validateWatchRulePath({
      path: "/data/assets/books",
      existingRules: [],
      forbiddenRoots: ["/data/assets", "/data/uploads"],
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error, "asset-folder")
  })

  void it("rejects the forbidden root itself", () => {
    const result = validateWatchRulePath({
      path: "/data/assets",
      existingRules: [],
      forbiddenRoots: ["/data/assets"],
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error, "asset-folder")
  })

  void it("skips comparison against the rule under edit", () => {
    const result = validateWatchRulePath({
      path: "/library/a",
      existingRules: [rule("u1", "watch", "/library/a")],
      excludeUuid: "u1" as UUID,
    })
    assert.deepStrictEqual(result, { ok: true })
  })

  void it("treats paths with trailing slashes as equal", () => {
    const result = validateWatchRulePath({
      path: "/library/a/",
      existingRules: [rule("u1", "watch", "/library/a")],
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(result.error, "duplicate")
  })

  void it("does not consider /library/abc a child of /library/ab", () => {
    // string-prefix bugs would falsely flag this. the validator must split
    // on the path separator.
    const result = validateWatchRulePath({
      path: "/library/abc",
      existingRules: [rule("u1", "watch", "/library/ab")],
    })
    assert.deepStrictEqual(result, { ok: true })
  })
})
