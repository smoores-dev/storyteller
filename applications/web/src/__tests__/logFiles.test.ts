import assert from "node:assert"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, it } from "vitest"

import { listLogFiles, readLastLines } from "@/logFiles"

function record(level: number, time: number, msg: string) {
  return JSON.stringify({ level, time, msg, pid: 1, hostname: "x" })
}

const CONTENT = [
  record(30, 1000, "first"),
  record(20, 2000, "debug line"),
  "▲ Next.js started",
  record(30, 3000, "third"),
  "FATAL ERROR: Reached heap limit",
  "    at somewhere",
  record(60, 4000, "server exited with code 134"),
].join("\n")

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "st-logfiles-"))
  await writeFile(join(dir, "storyteller-2026-09-04.log"), `${CONTENT}\n`)
  await writeFile(join(dir, "storyteller-2026-09-03.log"), "")
  await writeFile(join(dir, "notes.txt"), "ignored")

  const [today, yesterday] = await listLogFiles(dir)
  assert.ok(today)
  assert.ok(yesterday)
  return { today, yesterday }
}

describe("listLogFiles", () => {
  it("lists dated log files newest first", async () => {
    const { today, yesterday } = await setup()

    assert.strictEqual(today.date, "2026-09-04")
    assert.strictEqual(yesterday.date, "2026-09-03")
    assert.strictEqual(yesterday.size, 0)
  })
})

describe("readLastLines", () => {
  it("wraps raw output as records and keeps file order", async () => {
    const { today } = await setup()

    const lines = await readLastLines(today, 100)

    assert.deepStrictEqual(
      lines.map((line) => [line.level, line["msg"]]),
      [
        [30, "first"],
        [20, "debug line"],
        [40, "▲ Next.js started"],
        [30, "third"],
        [40, "FATAL ERROR: Reached heap limit"],
        [40, "    at somewhere"],
        [60, "server exited with code 134"],
      ],
    )
  })

  it("gives raw lines the time of the record that follows them", async () => {
    const { today } = await setup()

    const lines = await readLastLines(today, 100)

    assert.strictEqual(lines[2]?.time, 3000)
    assert.strictEqual(lines[4]?.time, 4000)
    assert.strictEqual(lines[5]?.time, 4000)
  })

  it("returns only the last matching lines", async () => {
    const { today } = await setup()

    const lines = await readLastLines(today, 2, (line) => line.level >= 40)

    assert.deepStrictEqual(
      lines.map((line) => line["msg"]),
      ["    at somewhere", "server exited with code 134"],
    )
  })

  it("reads an empty file", async () => {
    const { yesterday } = await setup()

    assert.deepStrictEqual(await readLastLines(yesterday, 10), [])
  })
})
