import assert from "node:assert"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { describe, it } from "vitest"

import { createTestLibrary } from "@/__tests__/harness/testFs"
import {
  readSnapshotChanges,
  writeWatcherSnapshot,
} from "@/assets/library/scanner/watcher-snapshot"

const execFileAsync = promisify(execFile)

async function countZombieChildren() {
  const { stdout } = await execFileAsync("ps", ["-A", "-o", "ppid=,stat="])
  return stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([ppid, stat]) => Number(ppid) === process.pid && stat?.startsWith("Z"),
    ).length
}

describe("watcher snapshots", () => {
  it.skipIf(process.platform === "win32")(
    "do not leave zombie child processes behind",
    async () => {
      await using library = await createTestLibrary("watcher-snapshot-zombies")
      await library.createBookFolder("book", { dummyEpub: true })

      const before = await countZombieChildren()

      for (let i = 0; i < 10; i++) {
        await writeWatcherSnapshot(library.root)
        await readSnapshotChanges(library.root)
      }

      assert.strictEqual(await countZombieChildren(), before)
    },
  )
})
