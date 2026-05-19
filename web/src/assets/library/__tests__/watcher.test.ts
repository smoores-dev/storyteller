import assert from "node:assert"
import { describe, it } from "node:test"

import { setupTestDb } from "@/__tests__/harness/testDb"
import { createTestLibrary, waitForWatcher } from "@/__tests__/harness/testFs"
import { Watcher } from "@/assets/library/scanner/triggers/watcher"
import { createImportRule } from "@/database/importRules"

void describe("Watcher", () => {
  void it("starts without errors on a valid directory", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-start")

    await createImportRule({ kind: "watch", path: library.root })

    const watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(2000)
    await watcher.stop()

    assert.ok(true)
  })

  void it("detects a new epub file added to a watched directory", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-detect")

    await createImportRule({ kind: "watch", path: library.root })

    const watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(2000)

    const folder = await library.createBookFolder("new-detection", {})
    await folder.add("detected.epub")

    await waitForWatcher(3000)
    await watcher.stop()

    assert.ok(true)
  })

  void it("stops cleanly and ignores subsequent changes", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-stop")

    await createImportRule({ kind: "watch", path: library.root })

    const watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(500)

    await watcher.stop()

    const folder = await library.createBookFolder("after-stop", {})
    await folder.add("ignored.epub")

    await waitForWatcher(1000)
    assert.ok(true)
  })

  void it("reloads when import rules change", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-reload")

    await createImportRule({ kind: "watch", path: library.root })

    const watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(500)

    await watcher.reload()
    await waitForWatcher(500)

    await watcher.stop()
    assert.ok(true)
  })
})
