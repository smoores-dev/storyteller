import assert from "node:assert"
import { join } from "node:path"

import parcelWatcher from "@parcel/watcher"
import { describe, it, vi } from "vitest"

import { setupTestDb } from "@/__tests__/harness/testDb"
import { createTestLibrary, waitForWatcher } from "@/__tests__/harness/testFs"
import { canonicalizePath } from "@/assets/library/scanner/folder"
import { Watcher } from "@/assets/library/scanner/triggers/watcher"
import { getBooks } from "@/database/books"
import { createImportRule } from "@/database/importRules"

describe("Watcher", () => {
  it("resubscribes after the subscription dies and picks up missed changes", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-resubscribe")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    const realSubscribe = parcelWatcher.subscribe.bind(parcelWatcher)
    const first: { mute?: () => void; fail?: () => void } = {}
    const subscribe = vi
      .spyOn(parcelWatcher, "subscribe")
      .mockImplementation((dir, callback, options) => {
        if (dir !== absoluteRoot || first.mute) {
          return realSubscribe(dir, callback, options)
        }

        let dead = false
        first.mute = () => {
          dead = true
        }
        first.fail = () => {
          void callback(
            new Error("Unable to poll: Interrupted system call"),
            [],
          )
        }

        return realSubscribe(
          dir,
          (error, events) => (dead ? undefined : callback(error, events)),
          options,
        )
      })

    try {
      await using watcher = new Watcher()
      await watcher.start()
      await waitForWatcher(2000)

      assert.ok(
        first.mute && first.fail,
        "first subscription should be captured",
      )
      first.mute()

      await library.createBookFolder("while-dead", { ebook: "moby-dick" })
      await waitForWatcher(2000)

      const booksWhileDead = await getBooks()
      assert.strictEqual(booksWhileDead.length, 0)

      first.fail()
      await waitForWatcher(6000)

      const rootSubscriptions = subscribe.mock.calls.filter(
        ([dir]) => dir === absoluteRoot,
      )
      assert.strictEqual(rootSubscriptions.length, 2)

      const books = await getBooks()
      assert.strictEqual(books.length, 1)
      assert.strictEqual(books[0]?.title, "Moby Dick; Or, The Whale")
    } finally {
      subscribe.mockRestore()
    }
  })

  it("detects a new epub file added to a watched directory", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-detect")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    await using watcher = new Watcher()

    await watcher.start()
    await waitForWatcher(2000)

    await library.createBookFolder("new-detection", { ebook: "moby-dick" })

    await waitForWatcher(5000)

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.title, "Moby Dick; Or, The Whale")
  })

  it("stops cleanly and ignores subsequent file additions", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-stop")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    await using watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(2000)

    await watcher.stop()

    await library.createBookFolder("after-stop", { ebook: "moby-dick" })
    await waitForWatcher(5000)

    const books = await getBooks()
    assert.strictEqual(books.length, 0)
  })

  it("reloads and watches a newly added import rule", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-reload")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    await using watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(2000)

    // create a second library and add it as a new rule
    await using library2 = await createTestLibrary("watcher-reload-2")
    const absoluteRoot2 = await canonicalizePath(library2.root)
    await createImportRule({ kind: "watch", path: absoluteRoot2 })

    await watcher.reload()
    await waitForWatcher(3000)

    await library2.createBookFolder("reloaded-book", { ebook: "moby-dick" })
    await waitForWatcher(5000)

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.title, "Moby Dick; Or, The Whale")
  })

  it("waits for the old subscription to close before resubscribing on reload", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-reload-same")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    const realSubscribe = parcelWatcher.subscribe.bind(parcelWatcher)
    const calls: string[] = []
    const subscribe = vi
      .spyOn(parcelWatcher, "subscribe")
      .mockImplementation(async (dir, callback, options) => {
        const subscription = await realSubscribe(dir, callback, options)
        if (dir !== absoluteRoot) return subscription

        calls.push("subscribe")
        return {
          unsubscribe: async () => {
            calls.push("unsubscribe start")
            await subscription.unsubscribe()
            await waitForWatcher(500)
            calls.push("unsubscribe end")
          },
        }
      })

    try {
      await using watcher = new Watcher()
      await watcher.start()
      await waitForWatcher(1000)

      await watcher.reload()
      await waitForWatcher(1000)

      assert.deepStrictEqual(calls, [
        "subscribe",
        "unsubscribe start",
        "unsubscribe end",
        "subscribe",
      ])

      await library.createBookFolder("after-reload", { ebook: "moby-dick" })
      await waitForWatcher(5000)

      const books = await getBooks()
      assert.strictEqual(books.length, 1)
    } finally {
      subscribe.mockRestore()
    }
  })

  it("detects multiple formats added sequentially to same book folder", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-multi")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    await using watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(2000)

    // first add an epub, watcher picks it up and creates a book
    const folder = await library.createBookFolder("multi-format", {
      ebook: "moby-dick",
    })
    await waitForWatcher(5000)

    const booksAfterEpub = await getBooks()
    assert.strictEqual(booksAfterEpub.length, 1)

    const book = booksAfterEpub[0]!
    assert.strictEqual(book.title, "Moby Dick; Or, The Whale")
    assert.strictEqual(
      book.ebook?.filepath,
      join(absoluteRoot, "multi-format", "moby-dick.epub"),
    )
    assert.strictEqual(book.audiobook, null)

    // then add audio files to the same folder, watcher picks them up
    // and attaches the audiobook relation to the same book
    await folder.addFixture(".", {
      name: "moby-dick",
      type: "audiobooks",
      contents: true,
    })
    await folder.expectFiles([
      "moby-dick.epub",
      "mobydick_001_002_melville.mp3",
      "mobydick_001_003_melville.mp3",
    ])
    await waitForWatcher(5000)

    const booksAfterAudio = await getBooks()
    assert.strictEqual(booksAfterAudio.length, 1)
    assert.strictEqual(
      booksAfterAudio[0]?.audiobook?.filepath,
      join(absoluteRoot, "multi-format"),
    )
    assert.ok(
      booksAfterAudio[0].audiobook.filepath,
      "audiobook should be attached to the same book after detecting mp3 files",
    )
  })

  it("treats deeply nested folders as separate books", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-nested")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    await using watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(2000)

    // `Author/BookA` and `Author/BookB` should produce two books, not get
    // collapsed into a single "Author" folder by an over-eager bucket
    // heuristic that walks up to the immediate child of the watch root.
    await library.createBookFolder("Author/BookA", { ebook: "moby-dick" })
    await library.createBookFolder("Author/BookB", { ebook: "moby-dick" })

    await waitForWatcher(5000)

    const books = await getBooks()
    assert.strictEqual(books.length, 2)
    const filepaths = books
      .map((b) => b.ebook?.filepath)
      .filter((p): p is string => !!p)
      .sort()
    assert.deepStrictEqual(filepaths, [
      join(absoluteRoot, "Author", "BookA", "moby-dick.epub"),
      join(absoluteRoot, "Author", "BookB", "moby-dick.epub"),
    ])
  })

  it("ignores writes inside internal data-dir folders that live under the watch root", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-internal")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    await using watcher = new Watcher()
    await watcher.start()
    await waitForWatcher(2000)

    await library.createBookFolder(".autoimport/scratch", {
      ebook: "moby-dick",
    })
    await library.createBookFolder("image-cache/abc", { ebook: "moby-dick" })
    await library.createBookFolder("uploads/staging", { ebook: "moby-dick" })

    // a real book at a normal location still gets picked up
    await library.createBookFolder("real-book", { ebook: "moby-dick" })

    await waitForWatcher(5000)

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(
      books[0]?.ebook?.filepath,
      join(absoluteRoot, "real-book", "moby-dick.epub"),
    )
  })

  it("ignores adding files to ignored paths", async () => {
    using _db = setupTestDb()
    await using library = await createTestLibrary("watcher-ignore")

    const absoluteRoot = await canonicalizePath(library.root)
    await createImportRule({ kind: "watch", path: absoluteRoot })

    const ignoredFolder = await library.createBookFolder("ignored-folder")
    const folderPath = await canonicalizePath(ignoredFolder.path)

    await createImportRule({
      kind: "ignore",
      path: folderPath,
    })

    const notIgnoredFolder =
      await library.createBookFolder("not-ignored-folder")

    await using watcher = new Watcher()
    await watcher.start()

    await ignoredFolder.addFixture(".", {
      name: "moby-dick",
      type: "audiobooks",
      contents: true,
    })
    await ignoredFolder.addFixture(".", {
      name: "moby-dick",
      type: "ebooks",
      contents: true,
    })
    await ignoredFolder.expectFiles([
      "moby-dick.epub",
      "mobydick_001_002_melville.mp3",
      "mobydick_001_003_melville.mp3",
    ])

    await notIgnoredFolder.addFixture(".", {
      name: "moby-dick",
      type: "ebooks",
      contents: true,
    })
    await notIgnoredFolder.addFixture(".", {
      name: "moby-dick",
      type: "audiobooks",
      contents: true,
    })
    await notIgnoredFolder.expectFiles([
      "moby-dick.epub",
      "mobydick_001_002_melville.mp3",
      "mobydick_001_003_melville.mp3",
    ])

    await waitForWatcher(10000)

    const books = await getBooks()
    assert.strictEqual(books.length, 1)
    assert.strictEqual(books[0]?.title, "Moby Dick; Or, The Whale")
    assert.strictEqual(
      books[0].ebook?.filepath,
      join(absoluteRoot, "not-ignored-folder", "moby-dick.epub"),
    )
    assert.strictEqual(
      books[0].audiobook?.filepath,
      join(absoluteRoot, "not-ignored-folder"),
    )
  })
})
