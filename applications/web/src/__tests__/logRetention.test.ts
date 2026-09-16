import assert from "node:assert"
import { mkdtemp, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, it } from "vitest"

import { pruneLogs } from "@/logRetention"

const TODAY = "2026-09-04"

const DATES = [
  TODAY,
  "2026-09-03",
  "2026-08-25",
  "2026-08-21",
  "2026-08-20",
  "2026-08-01",
]

async function setupLogDir() {
  const dir = await mkdtemp(join(tmpdir(), "st-logs-"))

  for (const date of DATES) {
    await writeFile(join(dir, `storyteller-${date}.log`), `${date}\n`)
  }
  await writeFile(join(dir, "unrelated.txt"), "ignore me")

  return dir
}

describe("pruneLogs", () => {
  it("deletes files older than the retention window", async () => {
    const dir = await setupLogDir()

    await pruneLogs(14, dir, TODAY)

    assert.deepStrictEqual((await readdir(dir)).sort(), [
      "storyteller-2026-08-21.log",
      "storyteller-2026-08-25.log",
      "storyteller-2026-09-03.log",
      `storyteller-${TODAY}.log`,
      "unrelated.txt",
    ])
  })

  it("keeps everything within a long window", async () => {
    const dir = await setupLogDir()

    await pruneLogs(365, dir, TODAY)

    assert.strictEqual((await readdir(dir)).length, DATES.length + 1)
  })
})
