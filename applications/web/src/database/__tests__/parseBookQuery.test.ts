import assert from "node:assert"

import { describe, it } from "vitest"

import { parseGetBooksOptions } from "@/app/api/v2/books/parseBookQuery"

describe("parseGetBooksOptions orderBy", () => {
  it("accepts a registry sort field", () => {
    const parsed = parseGetBooksOptions(
      new URLSearchParams("orderBy=createdAt&orderDirection=asc"),
    )
    assert.ok(parsed.ok)
    assert.strictEqual(parsed.opts.orderBy, "createdAt")
  })

  it("accepts seriesPosition when a series context is present", () => {
    const parsed = parseGetBooksOptions(
      new URLSearchParams(
        "orderBy=seriesPosition&orderDirection=asc&series=19845815-4158-4e1b-b5bf-d9c67455ce1d",
      ),
    )
    assert.ok(parsed.ok)
    assert.strictEqual(parsed.opts.orderBy, "seriesPosition")
    assert.strictEqual(
      parsed.opts.series,
      "19845815-4158-4e1b-b5bf-d9c67455ce1d",
    )
  })

  it("accepts seriesPosition without a series context", () => {
    const parsed = parseGetBooksOptions(
      new URLSearchParams("orderBy=seriesPosition&orderDirection=asc"),
    )
    assert.ok(parsed.ok)
    assert.strictEqual(parsed.opts.orderBy, "seriesPosition")
  })

  it("drops unknown sort fields", () => {
    const parsed = parseGetBooksOptions(new URLSearchParams("orderBy=evil"))
    assert.ok(parsed.ok)
    assert.strictEqual(parsed.opts.orderBy, undefined)
  })
})
