import assert from "node:assert/strict"
import { beforeEach, test, vi } from "vitest"

/**
 * A tiny in-memory filesystem, because the cleanup under test mixes the legacy
 * async deletion API with the newer synchronous `Directory` API.
 */
const { fs, Directory, File, deleteAsync } = vi.hoisted(() => {
  const fs = {
    dirs: new Set<string>(),
    files: new Set<string>(),
    asyncDeletions: [] as { path: string; settled: boolean }[],
  }

  const key = (value: string) =>
    value
      .replace(/^file:\/\//, "")
      .replace(/\/{2,}/g, "/")
      .replace(/\/$/, "")

  const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/"))

  const childrenOf = (path: string) => {
    const prefix = `${path}/`
    const names = new Set<string>()

    for (const entry of [...fs.dirs, ...fs.files]) {
      if (entry.startsWith(prefix) && entry !== path) {
        names.add(entry.slice(prefix.length).split("/")[0]!)
      }
    }

    return [...names].map((name) => `${prefix}${name}`)
  }

  const removeTree = (path: string) => {
    fs.files = new Set([...fs.files].filter((file) => !file.startsWith(path)))
    fs.dirs = new Set(
      [...fs.dirs].filter((dir) => !dir.startsWith(path) || dir === path),
    )
    fs.dirs.delete(path)
  }

  class FakeDirectory {
    uri: string

    constructor(...uris: string[]) {
      this.uri = uris.map((uri) => key(uri)).join("/")
    }

    get parentDirectory() {
      return new FakeDirectory(parentOf(key(this.uri)))
    }

    get exists() {
      return fs.dirs.has(key(this.uri))
    }

    list() {
      const path = key(this.uri)
      if (!fs.dirs.has(path)) {
        throw new Error(`Cannot list ${path}: directory does not exist`)
      }
      return childrenOf(path).map((child) =>
        fs.dirs.has(child) ? new FakeDirectory(child) : new FakeFile(child),
      )
    }

    delete() {
      const path = key(this.uri)
      if (!fs.dirs.has(path)) {
        throw new Error(`Cannot delete ${path}: directory does not exist`)
      }
      removeTree(path)
    }

    create() {}
  }

  class FakeFile {
    uri: string

    constructor(...uris: string[]) {
      this.uri = uris.map((uri) => key(uri)).join("/")
    }

    get parentDirectory() {
      return new FakeDirectory(parentOf(key(this.uri)))
    }

    async copy() {}
  }

  const deleteAsyncImpl = (path: string) => {
    const deletion = { path, settled: false }
    fs.asyncDeletions.push(deletion)

    // Resolves later, like the native deletion it stands in for.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const target = key(path)
        fs.files.delete(target)
        if (fs.dirs.has(target)) {
          removeTree(target)
        }
        deletion.settled = true
        resolve()
      }, 1)
    })
  }

  return {
    fs,
    Directory: FakeDirectory,
    File: FakeFile,
    deleteAsync: deleteAsyncImpl,
  }
})

vi.mock("expo-file-system", () => ({
  Directory,
  File,
  Paths: { extname: (path: string) => path.slice(path.lastIndexOf(".")) },
}))

vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file://documents/",
  copyAsync: async () => {},
  deleteAsync,
  getInfoAsync: async () => ({ exists: false }),
  makeDirectoryAsync: async () => {},
  readAsStringAsync: async () => "",
}))

vi.mock("@/modules/readium", () => ({
  extractArchive: async () => {},
}))

const {
  deleteImportedBookFiles,
  deleteImportScratchFiles,
  deleteLocalBookFiles,
} = await import("./files")

const UUID = "11111111-1111-4111-8111-111111111111"

const formatKey = (format: string) =>
  format === "audiobook" ? `${UUID}.audiobook` : `${UUID}.epub`

/** Seeds the tree an import leaves behind, for every format. */
function seedCopies(...formats: string[]) {
  for (const format of formats) {
    fs.dirs.add(`documents/books/archives/${UUID}/${format}`)
    fs.files.add(
      `documents/books/archives/${UUID}/${format}/${formatKey(format)}`,
    )
    fs.dirs.add(`documents/books/extracted/${UUID}/${format}`)
    fs.files.add(`documents/books/extracted/${UUID}/${format}/content.xhtml`)
  }
  fs.dirs.add(`documents/books/archives/${UUID}`)
  fs.dirs.add(`documents/books/extracted/${UUID}`)
  fs.dirs.add("documents")
  fs.dirs.add("documents/books")
}

function tree() {
  return [...fs.files, ...fs.dirs].sort()
}

beforeEach(() => {
  fs.dirs.clear()
  fs.files.clear()
  fs.asyncDeletions.length = 0
})

test("deletes every archive and extracted copy when an import fails", async () => {
  seedCopies("readaloud", "ebook")

  await deleteImportedBookFiles(UUID)

  assert.deepEqual(tree(), ["documents", "documents/books"])
})

test("deletes the cover written before the book record existed", async () => {
  const cover = `file://documents/books/covers/${UUID}.jpeg`
  fs.dirs.add(`documents/books/covers`)
  fs.files.add(`documents/books/covers/${UUID}.jpeg`)

  await deleteImportedBookFiles(UUID, cover)

  assert.ok(!fs.files.has(`documents/books/covers/${UUID}.jpeg`))
})

test("resolves only after every deletion has finished", async () => {
  seedCopies("readaloud")

  await deleteImportedBookFiles(UUID)

  assert.ok(fs.asyncDeletions.length > 0)
  assert.ok(
    fs.asyncDeletions.every((deletion) => deletion.settled),
    "cleanup resolved while deletions were still in flight",
  )
})

test("keeps the extracted tree and drops the archive on success", async () => {
  seedCopies("readaloud")

  await deleteImportScratchFiles(UUID, "readaloud")

  assert.deepEqual(
    tree(),
    [
      "documents",
      "documents/books",
      `documents/books/extracted/${UUID}`,
      `documents/books/extracted/${UUID}/readaloud`,
      `documents/books/extracted/${UUID}/readaloud/content.xhtml`,
    ],
    "the book should keep only its extracted readaloud tree",
  )
})

test("drops the duplicated readaloud copies when a plain epub wins", async () => {
  seedCopies("readaloud", "ebook")

  await deleteImportScratchFiles(UUID, "ebook")

  assert.deepEqual(
    tree(),
    [
      "documents",
      "documents/books",
      `documents/books/extracted/${UUID}`,
      `documents/books/extracted/${UUID}/ebook`,
      `documents/books/extracted/${UUID}/ebook/content.xhtml`,
    ],
    "the readaloud copies were duplicated before the format was known",
  )
})

test("prunes directories left empty but keeps ones holding data", async () => {
  seedCopies("readaloud", "audiobook")

  // Removing a single download of a multi-format book.
  await deleteLocalBookFiles(UUID, "readaloud")

  assert.ok(
    !fs.dirs.has(`documents/books/extracted/${UUID}/readaloud`),
    "the removed format's extracted directory should be gone",
  )
  assert.ok(
    !fs.dirs.has(`documents/books/archives/${UUID}/readaloud`),
    "the removed format's archive directory should be gone",
  )
  assert.ok(
    fs.dirs.has(`documents/books/extracted/${UUID}`),
    "the parent still holds the audiobook tree",
  )
  assert.ok(
    fs.files.has(
      `documents/books/archives/${UUID}/audiobook/${formatKey("audiobook")}`,
    ),
    "the other format's archive should be untouched",
  )
})

test("leaves other formats alone when one format is requested", async () => {
  seedCopies("readaloud", "ebook")

  await deleteLocalBookFiles(UUID, "ebook")

  const paths = fs.asyncDeletions.map((deletion) => deletion.path)

  assert.ok(paths.some((path) => path.includes("/ebook/")))
  assert.ok(!paths.some((path) => path.includes("readaloud")))
  assert.ok(!paths.some((path) => path.includes("audiobook")))
  // Deleting a single download must not remove the book's covers.
  assert.ok(!paths.some((path) => path.includes("/covers/")))
})
