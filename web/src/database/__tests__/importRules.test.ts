import assert from "node:assert"
import { join } from "node:path"
import { describe, it } from "node:test"

import { seedBooks, setupTestDb } from "@/__tests__/harness/testDb"
import { deleteBook } from "@/database/books"
import {
  addIgnoreRule,
  createImportRule,
  getIgnorePaths,
  getImportRules,
  getUserImportRules,
} from "@/database/importRules"
import { ASSETS_DIR } from "@/directories"
import { type UUID } from "@/uuid"

void describe("import rule attribution", () => {
  void it("addIgnoreRule defaults to source=user with null bookUuid", async () => {
    using _db = setupTestDb()
    await addIgnoreRule("/user/path")

    const rules = await getImportRules()
    assert.strictEqual(rules.length, 1)
    assert.strictEqual(rules[0]!.source, "user")
    assert.strictEqual(rules[0]!.bookUuid, null)
  })

  void it("addIgnoreRule records attribution when supplied", async () => {
    using _db = setupTestDb()
    const [bookUuid] = seedBooks(_db, [{ title: "Book A" }])
    await addIgnoreRule("/relocate/source.epub", {
      source: "import-relocate",
      bookUuid: bookUuid as UUID,
    })

    const rules = await getImportRules()
    assert.strictEqual(rules[0]!.source, "import-relocate")
    assert.strictEqual(rules[0]!.bookUuid, bookUuid)
  })

  void it("getUserImportRules filters out auto-created rules", async () => {
    using _db = setupTestDb()
    const [bookUuid] = seedBooks(_db, [{ title: "Book A" }])
    await createImportRule({ kind: "watch", path: "/library" })
    await addIgnoreRule("/auto/path", {
      source: "import-relocate",
      bookUuid: bookUuid as UUID,
    })
    await addIgnoreRule("/user-explicit", { source: "user" })

    const visible = await getUserImportRules()
    const paths = visible.map((r) => r.path).sort()
    assert.deepStrictEqual(paths, ["/library", "/user-explicit"])
  })

  void it("getIgnorePaths includes auto-created rules (scanner still needs them)", async () => {
    using _db = setupTestDb()
    const [bookUuid] = seedBooks(_db, [{ title: "Book A" }])
    await addIgnoreRule("/visible-to-scanner", {
      source: "import-relocate",
      bookUuid: bookUuid as UUID,
    })

    const paths = await getIgnorePaths()
    assert.deepStrictEqual(paths, ["/visible-to-scanner"])
  })

  void it("deleting a book cascades its auto-rules", async () => {
    using _db = setupTestDb()
    const [bookUuid] = seedBooks(_db, [{ title: "Book A" }])
    await addIgnoreRule("/relocate-source.epub", {
      source: "import-relocate",
      bookUuid: bookUuid as UUID,
    })
    await addIgnoreRule("/unrelated", { source: "user" })

    await deleteBook(bookUuid as UUID)

    const remaining = await getImportRules()
    assert.deepStrictEqual(
      remaining.map((r) => r.path),
      ["/unrelated"],
    )
  })

  void it("getImportRules populates bookTitle for linked books", async () => {
    using _db = setupTestDb()
    const [bookUuid] = seedBooks(_db, [{ title: "Linked Title" }])
    await addIgnoreRule("/with-book", {
      source: "import-relocate",
      bookUuid: bookUuid as UUID,
    })
    await addIgnoreRule("/without-book", { source: "user" })

    const rules = await getImportRules()
    const byPath = Object.fromEntries(rules.map((r) => [r.path, r]))
    assert.strictEqual(byPath["/with-book"]!.bookTitle, "Linked Title")
    assert.strictEqual(byPath["/without-book"]!.bookTitle, null)
  })

  void it("prevent-reimport rules survive book deletion (bookUuid null)", async () => {
    using _db = setupTestDb()
    const [bookUuid] = seedBooks(_db, [
      { title: "Book A", ebook: "/original/path.epub" },
    ])

    await deleteBook(bookUuid as UUID, { preventReImport: true })

    const remaining = await getImportRules()
    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0]!.source, "prevent-reimport")
    assert.strictEqual(remaining[0]!.bookUuid, null)
    assert.strictEqual(remaining[0]!.path, "/original/path.epub")
  })

  void it("relocated book + preventReImport → only the converted source-path rule remains (library-owned path needs no rule)", async () => {
    using _db = setupTestDb()
    const internalEbook = join(ASSETS_DIR, "text", "abc", "book.epub")
    const [bookUuid] = seedBooks(_db, [
      { title: "Book A", ebook: internalEbook },
    ])
    // simulate the import-relocate rule added during a copy/move/hardlink import
    await addIgnoreRule("/watch/source.epub", {
      source: "import-relocate",
      bookUuid: bookUuid as UUID,
    })

    await deleteBook(bookUuid as UUID, { preventReImport: true })

    const remaining = await getImportRules()
    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0]!.path, "/watch/source.epub")
    assert.strictEqual(remaining[0]!.source, "prevent-reimport")
    assert.strictEqual(remaining[0]!.bookUuid, null)
  })

  void it("reference-mode book + preventReImport → inserts rule for the external source path", async () => {
    using _db = setupTestDb()
    const [bookUuid] = seedBooks(_db, [
      { title: "Book A", ebook: "/watch/folder/reference-book.epub" },
    ])

    await deleteBook(bookUuid as UUID, { preventReImport: true })

    const remaining = await getImportRules()
    assert.strictEqual(remaining.length, 1)
    assert.strictEqual(remaining[0]!.path, "/watch/folder/reference-book.epub")
    assert.strictEqual(remaining[0]!.source, "prevent-reimport")
    assert.strictEqual(remaining[0]!.bookUuid, null)
  })
})
