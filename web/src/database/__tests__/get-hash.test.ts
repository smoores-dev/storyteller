import assert from "node:assert"
import { createHash } from "node:crypto"
import { mkdir, open, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"

import { computeFileHash } from "@/assets/fs"

const TEST_DIR = join("src", "__fixtures__", "__output__", "hash-tests")

void describe("computeFileHash", () => {
  before(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  after(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  void it("computes SHA-256 hash for a text file", async () => {
    const testFile = join(TEST_DIR, "test.txt")
    const content = "Hello, World!"
    await writeFile(testFile, content)

    const hash = await computeFileHash(testFile)
    const expectedHash = createHash("sha256").update(content).digest("hex")

    assert.strictEqual(hash, expectedHash)
    assert.strictEqual(hash.length, 64)
  })

  void it("computes SHA-256 hash for a binary file", async () => {
    const testFile = join(TEST_DIR, "test.bin")
    const content = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd])
    await writeFile(testFile, content)

    const hash = await computeFileHash(testFile)
    const expectedHash = createHash("sha256").update(content).digest("hex")

    assert.strictEqual(hash, expectedHash)
  })

  void it("produces different hashes for different content", async () => {
    const file1 = join(TEST_DIR, "file1.txt")
    const file2 = join(TEST_DIR, "file2.txt")

    await writeFile(file1, "Content A")
    await writeFile(file2, "Content B")

    const hash1 = await computeFileHash(file1)
    const hash2 = await computeFileHash(file2)

    assert.notStrictEqual(hash1, hash2)
  })

  void it("produces same hash for identical content", async () => {
    const file1 = join(TEST_DIR, "identical1.txt")
    const file2 = join(TEST_DIR, "identical2.txt")
    const content = "Identical content"

    await writeFile(file1, content)
    await writeFile(file2, content)

    const hash1 = await computeFileHash(file1)
    const hash2 = await computeFileHash(file2)

    assert.strictEqual(hash1, hash2)
  })

  void it("computes hash for empty file", async () => {
    const testFile = join(TEST_DIR, "empty.txt")
    await writeFile(testFile, "")

    const hash = await computeFileHash(testFile)
    const expectedHash = createHash("sha256").update("").digest("hex")

    assert.strictEqual(hash, expectedHash)
    assert.strictEqual(
      hash,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
  })

  void it("computes hash for 3GB file", async () => {
    const testFile = join(TEST_DIR, "3gb.bin")
    const hash = createHash("sha256")
    const chunk = Buffer.alloc(1024 * 1024, "A")
    const numChunks = 3 * 1024

    const fileHandle = await open(testFile, "w")
    try {
      for (let i = 0; i < numChunks; i++) {
        await fileHandle.write(chunk)
        hash.update(chunk)
      }
    } finally {
      await fileHandle.close()
    }

    const computedHash = await computeFileHash(testFile)
    const expectedHash = hash.digest("hex")

    assert.strictEqual(computedHash, expectedHash)
  })

  void it("throws error for non-existent file", async () => {
    const nonExistentFile = join(TEST_DIR, "does-not-exist.txt")

    await assert.rejects(computeFileHash(nonExistentFile), (err: Error) => {
      assert.ok(err.message.includes("ENOENT"))
      return true
    })
  })
})
