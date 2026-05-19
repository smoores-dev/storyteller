import assert from "node:assert"
import { describe, it } from "node:test"

import { setupTestDb } from "@/__tests__/harness/testDb"
import { createTestLibrary } from "@/__tests__/harness/testFs"
import { discoverBookPathsForRoots } from "@/assets/library/discovery"

void describe("discoverBookPathsForRoots", () => {
  void it("discovers an epub in a book folder", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-epub")

    await library.createBookFolder("my-book", { dummyEpub: true })

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set(),
      new Set(),
      AbortSignal.timeout(5000),
    )

    assert.strictEqual(paths.length, 1)

    // single unknown epub gets classified as epubUnknown since the scanner
    // hasn't seen it before as either ebook or readaloud
    const entry = paths[0]!
    const epubPath = entry.ebook ?? entry.epubUnknown?.[0]
    assert.ok(epubPath?.endsWith(".epub"))
    assert.ok(epubPath?.includes("my-book"))
  })

  void it("discovers audiobook folder alongside epub", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-combo")

    await library.createBookFolder("multi-format", {
      dummyEpub: "book.epub",
      dummyAudio: ["track01.mp3", "track02.mp3"],
    })

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set(),
      new Set(),
      AbortSignal.timeout(5000),
    )

    assert.strictEqual(paths.length, 1)

    const entry = paths[0]!
    const epubPath = entry.ebook ?? entry.epubUnknown?.[0]
    assert.ok(epubPath?.endsWith("book.epub"))
    assert.ok(entry.audiobook?.includes("multi-format"))
  })

  void it("skips files directly at the root level", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-root")

    const folder = await library.createBookFolder("root-test", {})
    await folder.add("../stray-file.epub")

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set(),
      new Set(),
      AbortSignal.timeout(5000),
    )

    assert.strictEqual(paths.length, 0)
  })

  void it("classifies known ebook and readaloud paths separately", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-classify")

    const folder = await library.createBookFolder("classified", {})
    const ebookPath = await folder.add("ebook.epub")
    const readaloudPath = await folder.add("readaloud.epub")

    // on macOS /tmp is a symlink to /private/var/..., and the discovery code
    // uses realpath internally, so we need the canonical paths in knownPaths
    const { realpath } = await import("node:fs/promises")
    const canonicalEbook = await realpath(ebookPath)
    const canonicalReadaloud = await realpath(readaloudPath)

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set([canonicalEbook]),
      new Set([canonicalReadaloud]),
      AbortSignal.timeout(5000),
    )

    assert.strictEqual(paths.length, 1)
    assert.strictEqual(paths[0]?.ebook, canonicalEbook)
    assert.strictEqual(paths[0].readaloud, canonicalReadaloud)
  })

  void it("marks unknown epubs as epubUnknown", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-unknown")

    const folder = await library.createBookFolder("unknown-epub", {})
    await folder.add("mystery.epub")

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set(),
      new Set(),
      AbortSignal.timeout(5000),
    )

    assert.strictEqual(paths.length, 1)
    assert.ok(paths[0]?.epubUnknown?.length === 1)
    assert.ok(paths[0].epubUnknown[0]?.endsWith("mystery.epub"))
  })

  void it("warns and skips when more than 2 epubs in a single folder", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-toomany")

    const folder = await library.createBookFolder("too-many-epubs", {})
    await folder.add("one.epub")
    await folder.add("two.epub")
    await folder.add("three.epub")

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set(),
      new Set(),
      AbortSignal.timeout(5000),
    )

    assert.strictEqual(paths.length, 0)
  })

  void it("respects abort signal", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-abort")

    await library.createBookFolder("book1", { dummyEpub: true })

    const controller = new AbortController()
    controller.abort()

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set(),
      new Set(),
      controller.signal,
    )

    assert.strictEqual(paths.length, 0)
  })

  void it("discovers real epub from fixtures", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-real")

    await library.createBookFolder("moby-dick", { ebook: "moby-dick" })

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set(),
      new Set(),
      AbortSignal.timeout(5000),
    )

    assert.strictEqual(paths.length, 1)
    assert.ok(paths[0]?.epubUnknown?.[0]?.endsWith(".epub"))
  })

  void it("discovers real audiobook from fixtures", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("discovery-audio")

    await library.createBookFolder("moby-dick-audio", {
      audiobook: "moby-dick",
    })

    const paths = await discoverBookPathsForRoots(
      [{ rootPath: library.root, warnIfFileAtRoot: true }],
      new Set(),
      new Set(),
      AbortSignal.timeout(5000),
    )

    assert.strictEqual(paths.length, 1)
    assert.ok(paths[0]?.audiobook?.includes("moby-dick-audio"))
  })
})
