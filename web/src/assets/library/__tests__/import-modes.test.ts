import assert from "node:assert"
import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"

import { setupTestDb } from "@/__tests__/harness/testDb"
import { createTestLibrary, waitForWatcher } from "@/__tests__/harness/testFs"
import { canonicalizePath } from "@/assets/library/scanner/folder"
import { scan, scanLibrary } from "@/assets/library/scanner/scan"
import { Watcher } from "@/assets/library/scanner/triggers/watcher"
import { getBook, getBooks } from "@/database/books"
import { createImportRule } from "@/database/importRules"
import { ASSETS_DIR } from "@/directories"

const FIXTURES_DIR = join(
  dirname(dirname(new URL(import.meta.url).pathname)),
  "..",
  "..",
  "__fixtures__",
  "books",
)

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return false
    }
    throw err
  }
}

// hardlink and reflink only share storage within one filesystem. on macos
// tmpdir lives on a different mount than the assets dir, so for tests that
// care about inode sharing we put the fixture next to ASSETS_DIR instead.
async function createSameDeviceLibrary(prefix: string) {
  const parent = dirname(ASSETS_DIR)
  if (await exists(parent)) {
    await rm(parent, { recursive: true, force: true })
  }
  await mkdir(parent, { recursive: true })
  const root = await mkdtemp(join(parent, `import-mode-test-${prefix}-`))
  return {
    root,
    async addFixture(
      folderName: string,
      type: "ebooks" | "audiobooks",
      fixtureName: string,
    ): Promise<string> {
      const dest = join(root, folderName)
      await mkdir(dest, { recursive: true })
      await cp(join(FIXTURES_DIR, type, fixtureName), dest, { recursive: true })
      return dest
    },
    async [Symbol.asyncDispose]() {
      await rm(root, { recursive: true, force: true })
    },
  }
}

void describe("scanner import modes", () => {
  void it("reference mode leaves the file at the source path", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("import-mode-reference")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("ref", { ebook: "moby-dick" })
    const source = await canonicalizePath(join(folder.path, "moby-dick.epub"))

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "reference",
    })

    const signal = new AbortController().signal

    await scanLibrary({
      source: "manual",
      signal: signal,
    })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.ebook?.filepath, source)
    assert.ok(await exists(source), "source file should still exist")
  })

  void it("copy mode duplicates the file and leaves the source intact", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("import-mode-copy")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("copy", {
      ebook: "moby-dick",
    })
    const source = join(folder.path, "moby-dick.epub")

    await createImportRule({ kind: "watch", path: root, importMode: "copy" })

    await scanLibrary({
      source: "manual",
      signal: new AbortController().signal,
    })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    const dest = books[0]?.ebook?.filepath
    assert.ok(dest, "ebook should have a filepath")
    assert.notStrictEqual(dest, source, "filepath should point at the copy")
    assert.ok(dest.startsWith(ASSETS_DIR), "copy should land under ASSETS_DIR")
    assert.ok(await exists(source), "source file should remain")
    assert.ok(await exists(dest), "dest file should exist")

    const srcStat = await stat(source)
    const dstStat = await stat(dest)
    assert.notStrictEqual(
      srcStat.ino,
      dstStat.ino,
      "copy/reflink must produce a distinct inode",
    )
  })

  void it("hardlink mode links the file to the assets dir", async () => {
    using _db = setupTestDb()
    await using library = await createSameDeviceLibrary("hardlink")

    const root = await canonicalizePath(library.root)
    const folderPath = await library.addFixture("hl", "ebooks", "moby-dick")
    const source = join(folderPath, "moby-dick.epub")

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "hardlink",
    })

    await scanLibrary({
      source: "manual",
      signal: new AbortController().signal,
    })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    const dest = books[0]?.ebook?.filepath
    assert.ok(dest, "ebook should have a filepath")
    assert.ok(await exists(source), "source file should remain")
    assert.ok(await exists(dest), "dest file should exist")

    const srcStat = await stat(source)
    const dstStat = await stat(dest)
    assert.strictEqual(
      srcStat.dev,
      dstStat.dev,
      "test setup must place library on the assets device",
    )
    assert.strictEqual(
      srcStat.ino,
      dstStat.ino,
      "hardlink should share an inode with the source",
    )
    assert.ok(
      srcStat.nlink >= 2,
      "hardlink should have nlink >= 2, was: " + srcStat.nlink.toString(),
    )
  })

  void it("move mode relocates the file and removes the source", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("import-mode-move")

    const root = await canonicalizePath(library.root)
    const folder = await library.createBookFolder("mv", { ebook: "moby-dick" })
    const source = join(folder.path, "moby-dick.epub")

    await createImportRule({ kind: "watch", path: root, importMode: "move" })

    await scanLibrary({
      source: "manual",
      signal: new AbortController().signal,
    })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    const dest = books[0]?.ebook?.filepath
    assert.ok(dest, "ebook should have a filepath")
    assert.ok(dest.startsWith(ASSETS_DIR), "dest should land under ASSETS_DIR")
    assert.ok(await exists(dest), "dest file should exist")
    assert.strictEqual(
      await exists(source),
      false,
      "source file should be gone after move",
    )
  })

  void it("two rules with different modes do not bleed into each other", async () => {
    using _db = setupTestDb()
    await using libCopy = await createTestLibrary("import-mode-bleed-copy")
    await using libMove = await createTestLibrary("import-mode-bleed-move")

    const rootCopy = await canonicalizePath(libCopy.root)
    const rootMove = await canonicalizePath(libMove.root)

    const folderCopy = await libCopy.createBookFolder("a", {
      ebook: "moby-dick",
    })
    const folderMove = await libMove.createBookFolder("b", {
      ebook: "moby-dick",
    })

    const sourceCopy = join(folderCopy.path, "moby-dick.epub")
    const sourceMove = join(folderMove.path, "moby-dick.epub")

    await createImportRule({
      kind: "watch",
      path: rootCopy,
      importMode: "copy",
    })
    await createImportRule({
      kind: "watch",
      path: rootMove,
      importMode: "move",
    })

    await scanLibrary({
      source: "manual",
      signal: new AbortController().signal,
    })

    assert.ok(
      await exists(sourceCopy),
      "copy rule's source must still exist after the scan",
    )
    assert.strictEqual(
      await exists(sourceMove),
      false,
      "move rule's source must be gone after the scan",
    )
  })

  void it("audiobook import respects the rule's mode", async () => {
    using _db = setupTestDb()
    await using library = await createSameDeviceLibrary("audiobook-hardlink")

    const root = await canonicalizePath(library.root)
    const folderPath = await library.addFixture(
      "audio",
      "audiobooks",
      "moby-dick",
    )

    await createImportRule({
      kind: "watch",
      path: root,
      importMode: "hardlink",
    })

    await scanLibrary({
      source: "manual",
      signal: new AbortController().signal,
    })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    const destDir = books[0]?.audiobook?.filepath
    assert.ok(destDir, "audiobook should have a filepath")

    const srcMp3 = join(folderPath, "mobydick_001_002_melville.mp3")
    const dstMp3 = join(destDir, "mobydick_001_002_melville.mp3")
    assert.ok(await exists(srcMp3), "source mp3 should remain")
    assert.ok(await exists(dstMp3), "dest mp3 should exist")

    const srcStat = await stat(srcMp3)
    const dstStat = await stat(dstMp3)
    assert.strictEqual(srcStat.dev, dstStat.dev)
    assert.strictEqual(
      srcStat.ino,
      dstStat.ino,
      "hardlink should share inodes for audiobook tracks",
    )
  })

  void it.skip("copy mode does not re-import via the asset-folder watcher", async () => {
    using _db = setupTestDb()
    // asset-folder watcher's bootstrap scans ASSETS_DIR. leftovers from
    // earlier tests in this run would inflate the book count, so wipe it
    // before measuring. recreate the empty dir so relocate.ts can mkdir
    // into it without ENOENT.
    await rm(ASSETS_DIR, { recursive: true, force: true })
    await mkdir(ASSETS_DIR, { recursive: true })

    await using library = await createTestLibrary("import-mode-no-loop")

    const root = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: root, importMode: "copy" })

    await using watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(2000)

    await library.createBookFolder("loop-check", { ebook: "moby-dick" })

    await waitForWatcher(3000)

    const books = await getBooks()
    assert.strictEqual(
      books.length,
      1,
      "asset-folder watcher must not produce a second book",
    )
    const book = await getBook(books[0]!.uuid)
    assert.ok(book?.ebook?.filepath.startsWith(ASSETS_DIR))
  })

  void it("two same-title books in reference mode get distinct asset folders", async () => {
    using _db = setupTestDb()
    // wipe ASSETS_DIR so leftovers from earlier tests don't influence the
    // collision check we're about to make.
    await rm(ASSETS_DIR, { recursive: true, force: true })
    await mkdir(ASSETS_DIR, { recursive: true })

    await using libA = await createTestLibrary("import-mode-collide-a")
    await using libB = await createTestLibrary("import-mode-collide-b")

    const rootA = await canonicalizePath(libA.root)
    const rootB = await canonicalizePath(libB.root)
    await libA.createBookFolder("a", { ebook: "moby-dick" })
    await libB.createBookFolder("b", { ebook: "moby-dick" })

    await createImportRule({
      kind: "watch",
      path: rootA,
      importMode: "reference",
    })
    await createImportRule({
      kind: "watch",
      path: rootB,
      importMode: "reference",
    })

    await scanLibrary({
      source: "manual",
      signal: new AbortController().signal,
    })

    const books = await getBooks()
    assert.strictEqual(books.length, 2)
    const [first, second] = books
    assert.ok(first && second)
    assert.notStrictEqual(
      first.assetDir,
      second.assetDir,
      "same-title books must end up with distinct asset directories",
    )
  })

  void it("candidates request without an explicit mode uses the scan default", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("import-mode-candidates")

    const folder = await library.createBookFolder("cand", {
      ebook: "moby-dick",
    })
    const source = join(folder.path, "moby-dick.epub")

    const signal = new AbortController().signal
    await scan({
      source: "manual",
      request: {
        kind: "candidates",
        candidates: [
          {
            folder: folder.path,
            format: "ebook",
            filepath: source,
          },
        ],
      },
      options: { importMode: "reference" },
      signal: signal,
    })

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.ebook?.filepath, source)
    assert.ok(await exists(source))
  })
})
