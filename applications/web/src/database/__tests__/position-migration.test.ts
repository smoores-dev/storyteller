import assert from "node:assert"

import { describe, it } from "vitest"

import { MediaType } from "@storyteller-platform/media-types"

import { fromLegacyLocator } from "@/database/positions"

describe("getTrackInfo", () => {
  it("can migrate a locator", () => {
    const locator = {
      href: "/test",
      locations: {
        fragments: ["test"],
        totalProgression: 0.5,
      },
      type: MediaType.XHTML.mime,
    }
    const migratedLocator = fromLegacyLocator(locator)
    assert.strictEqual(migratedLocator.href, "test")
  })

  it("can migrate a locator with special characters", () => {
    const locator = {
      href: "/dir/my chapter.html",
      locations: {
        fragments: ["test"],
        totalProgression: 0.5,
      },
      type: MediaType.XHTML.mime,
    }

    const migratedLocator = fromLegacyLocator(locator)
    assert.strictEqual(migratedLocator.href, "dir/my%20chapter.html")
  })

  it("can migrate a locator that already was encoded", () => {
    const locator = {
      href: "/dir/my%20chapter.html",
      locations: {
        fragments: ["test"],
        totalProgression: 0.5,
      },
      type: MediaType.XHTML.mime,
    }

    const migratedLocator = fromLegacyLocator(locator)
    assert.strictEqual(migratedLocator.href, "dir/my%20chapter.html")
  })

  it("will ignore an href with an absolute path", () => {
    const locator = {
      href: "http://example.com/dir/my%20chapter.html",
      locations: {
        fragments: ["test"],
        totalProgression: 0.5,
      },
      type: MediaType.XHTML.mime,
    }

    const migratedLocator = fromLegacyLocator(locator)
    assert.strictEqual(
      migratedLocator.href,
      "http://example.com/dir/my%20chapter.html",
    )
  })
})
