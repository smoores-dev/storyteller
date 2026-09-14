import assert from "node:assert"

import { describe, it } from "vitest"

import {
  isSuppressed,
  releasePrefixAfterSettle,
  suppressPrefix,
} from "@/assets/library/scanner/write-intent"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("write intent", () => {
  it("suppresses a path and everything under it", () => {
    suppressPrefix("/library/book")

    assert.ok(isSuppressed("/library/book"))
    assert.ok(isSuppressed("/library/book/cover.jpg"))
    assert.ok(!isSuppressed("/library/other"))
  })

  it("keeps a released path suppressed until the events it covers arrive", async () => {
    suppressPrefix("/library/released.epub", 50)
    releasePrefixAfterSettle("/library/released.epub")

    await sleep(100)

    assert.ok(
      isSuppressed("/library/released.epub"),
      "releasing must outlive the original ttl, filesystem events land after the write returns",
    )
  })

  it("releasing a path that was never suppressed does nothing", () => {
    releasePrefixAfterSettle("/library/never-suppressed.epub")

    assert.ok(!isSuppressed("/library/never-suppressed.epub"))
  })
})
