import assert from "node:assert"
import { describe, it } from "node:test"

import { parseGetBooksOptions } from "@/app/api/v2/books/parseBookQuery"

void describe("parseGetBooksOptions orderBy", () => {
  void it("accepts a registry sort field", () => {
    const parsed = parseGetBooksOptions(
      new URLSearchParams("orderBy=createdAt&orderDirection=asc"),
    )
    assert.ok(parsed.ok)
    assert.strictEqual(parsed.opts.orderBy, "createdAt")
  })

  void it("accepts seriesPosition when a series context is present", () => {
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

  void it("drops seriesPosition without a series context", () => {
    const parsed = parseGetBooksOptions(
      new URLSearchParams("orderBy=seriesPosition&orderDirection=asc"),
    )
    assert.ok(parsed.ok)
    assert.strictEqual(parsed.opts.orderBy, undefined)
  })

  void it("drops unknown sort fields", () => {
    const parsed = parseGetBooksOptions(new URLSearchParams("orderBy=evil"))
    assert.ok(parsed.ok)
    assert.strictEqual(parsed.opts.orderBy, undefined)
  })
})
