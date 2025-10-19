import assert from "node:assert"
import { describe, it } from "node:test"

import { fromLegacyLocator } from "../positions"

void describe("getTrackInfo", () => {
  void it("can migrate a locator", () => {
    const locator = {
      href: "/test",
      locations: {
        fragments: ["test"],
        totalProgression: 0.5,
      },
      type: "application/xhtml+xml",
    }
    const migratedLocator = fromLegacyLocator(locator)
    assert.strictEqual(migratedLocator.href, "test")
  })

  void it("can migrate a locator with special characters", () => {
    const locator = {
      href: "/dir/my chapter.html",
      locations: {
        fragments: ["test"],
        totalProgression: 0.5,
      },
      type: "application/xhtml+xml",
    }

    const migratedLocator = fromLegacyLocator(locator)
    assert.strictEqual(migratedLocator.href, "dir/my%20chapter.html")
  })

  void it("can migrate a locator that already was encoded", () => {
    const locator = {
      href: "/dir/my%20chapter.html",
      locations: {
        fragments: ["test"],
        totalProgression: 0.5,
      },
      type: "application/xhtml+xml",
    }

    const migratedLocator = fromLegacyLocator(locator)
    assert.strictEqual(migratedLocator.href, "dir/my%20chapter.html")
  })

  void it("will ignore an href with an absolute path", () => {
    const locator = {
      href: "http://example.com/dir/my%20chapter.html",
      locations: {
        fragments: ["test"],
        totalProgression: 0.5,
      },
      type: "application/xhtml+xml",
    }

    const migratedLocator = fromLegacyLocator(locator)
    assert.strictEqual(
      migratedLocator.href,
      "http://example.com/dir/my%20chapter.html",
    )
  })
})
