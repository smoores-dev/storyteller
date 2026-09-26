import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { afterAll, describe, it, vi } from "vitest"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import { ASSETS_DIR } from "@/directories"
import { deleteOrphanFolders, findOrphanFolders } from "@/maintenance"

const previousAssetsDir = await vi.hoisted(async () => {
  const fs = await import("node:fs/promises")
  const os = await import("node:os")
  const path = await import("node:path")
  const previous = process.env["STORYTELLER_ASSETS_DIR"]
  process.env["STORYTELLER_ASSETS_DIR"] = await fs.mkdtemp(
    path.join(os.tmpdir(), "storyteller-maintenance-"),
  )
  return previous
})

afterAll(async () => {
  await rm(ASSETS_DIR, { recursive: true, force: true })
  if (previousAssetsDir === undefined) {
    delete process.env["STORYTELLER_ASSETS_DIR"]
  } else {
    process.env["STORYTELLER_ASSETS_DIR"] = previousAssetsDir
  }
})

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000)

async function makeFolder(
  name: string,
  { old = true, subfolder = "transcoded audio" } = {},
) {
  const path = join(ASSETS_DIR, name)
  const file = join(path, subfolder, "00001.bin")
  await mkdir(join(path, subfolder), { recursive: true })
  await writeFile(file, Buffer.alloc(10))
  if (old) {
    for (const entry of [file, join(path, subfolder), path]) {
      await utimes(entry, TWO_HOURS_AGO, TWO_HOURS_AGO)
    }
  }
  return path
}

function names(orphans: { name: string }[]) {
  return orphans.map((orphan) => orphan.name)
}

async function exists(path: string) {
  return await stat(path).then(
    () => true,
    () => false,
  )
}

describe("findOrphanFolders", () => {
  it("lists an old folder that no book uses", async () => {
    using _db = setupTestDb()
    const name = `orphan ${randomUUID()}`
    await makeFolder(name)

    assert.ok(names(await findOrphanFolders()).includes(name))
  })

  it("leaves out a book's own folder", async () => {
    using db = setupTestDb()
    const title = `owned ${randomUUID()}`
    seedBooks(db, [{ title }])
    await makeFolder(title)

    assert.ok(!names(await findOrphanFolders()).includes(title))
  })

  it("leaves out a folder that holds another book's file", async () => {
    using db = setupTestDb()
    const name = `stray readaloud ${randomUUID()}`
    const path = await makeFolder(name)
    seedBooks(db, [{ title: randomUUID(), readaloud: join(path, "book.epub") }])

    assert.ok(!names(await findOrphanFolders()).includes(name))
  })

  it("leaves out a folder whose name differs from a book's only in case", async () => {
    using db = setupTestDb()
    const title = `Cased ${randomUUID()}`
    seedBooks(db, [{ title }])
    await makeFolder(title.toLowerCase())

    assert.ok(!names(await findOrphanFolders()).includes(title.toLowerCase()))
  })

  it("leaves out a folder holding something Storyteller never writes", async () => {
    using _db = setupTestDb()
    const name = `foreign ${randomUUID()}`
    await makeFolder(name, { subfolder: "Photos" })

    assert.ok(!names(await findOrphanFolders()).includes(name))
  })

  it("marks folders that still hold book files", async () => {
    using _db = setupTestDb()
    const leftover = `leftover ${randomUUID()}`
    const lost = `lost book ${randomUUID()}`
    await makeFolder(leftover)
    await makeFolder(lost, { subfolder: "text" })

    const orphans = await findOrphanFolders()
    assert.strictEqual(
      orphans.find((orphan) => orphan.name === leftover)?.hasBookFiles,
      false,
    )
    assert.strictEqual(
      orphans.find((orphan) => orphan.name === lost)?.hasBookFiles,
      true,
    )
  })

  it("leaves out a folder changed in the last hour", async () => {
    using _db = setupTestDb()
    const name = `fresh ${randomUUID()}`
    await makeFolder(name, { old: false })

    assert.ok(!names(await findOrphanFolders()).includes(name))
  })
})

describe("deleteOrphanFolders", () => {
  it("deletes only the named orphans", async () => {
    using db = setupTestDb()
    const doomed = await makeFolder(`doomed ${randomUUID()}`)
    const spared = await makeFolder(`spared ${randomUUID()}`)
    const title = `kept ${randomUUID()}`
    seedBooks(db, [{ title }])
    const owned = await makeFolder(title)

    const deleted = await deleteOrphanFolders([
      doomed.slice(ASSETS_DIR.length + 1),
      title,
    ])

    assert.strictEqual(deleted, 1)
    assert.strictEqual(await exists(doomed), false)
    assert.strictEqual(await exists(spared), true)
    assert.strictEqual(await exists(owned), true)
  })
})
