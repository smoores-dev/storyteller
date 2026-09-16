import assert from "node:assert"

import { describe, it } from "vitest"

import {
  type LegacyFilterNode,
  rewrite,
} from "@/database/migrations/107_unify_format_filter.sql"

describe("107_unify_format_filter rewrite", () => {
  it("renames a mediaType condition and its synced value", () => {
    const filter: LegacyFilterNode = {
      type: "condition",
      field: "mediaType",
      value: "synced",
    }

    assert.strictEqual(rewrite(filter), true)
    assert.strictEqual(filter.field, "format")
    assert.strictEqual(filter.value, "readaloud")
  })

  it("maps synced inside isAnyOf arrays and walks nested groups", () => {
    const filter: LegacyFilterNode = {
      type: "and",
      children: [
        {
          type: "not",
          child: {
            type: "condition",
            field: "mediaType",
            value: ["synced", "ebook-only"],
          },
        },
        { type: "condition", field: "title", value: "synced" },
      ],
    }

    assert.strictEqual(rewrite(filter), true)
    const condition = filter.children?.[0]?.child
    assert.ok(condition)
    assert.strictEqual(condition.field, "format")
    assert.deepStrictEqual(condition.value, ["readaloud", "ebook-only"])
    assert.strictEqual(filter.children?.[1]?.value, "synced")
  })

  it("reports untouched filters as unchanged", () => {
    const filter: LegacyFilterNode = {
      type: "condition",
      field: "tags",
      value: ["a"],
    }

    assert.strictEqual(rewrite(filter), false)
  })
})
