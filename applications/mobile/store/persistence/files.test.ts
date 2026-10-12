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
  getLocalBookFileUrl,
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

function resolvesTo(url: string, relativeFilepath: string) {
  const decoded = url
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/")

  assert.ok(
    decoded.endsWith(relativeFilepath),
    `${url} resolves to ${decoded}, not .../${relativeFilepath}`,
  )
}

test.each(["readaloud", "ebook", "audiobook"] as const)(
  `resolves a percent-encoded href to the extracted file (%s)`,
  (format) => {
    resolvesTo(
      getLocalBookFileUrl(
        UUID,
        format,
        "Audio/01_An_Unexpected_Party_%5B2019_Edition%5D.mp3",
      ),
      "Audio/01_An_Unexpected_Party_[2019_Edition].mp3",
    )
    resolvesTo(
      getLocalBookFileUrl(
        UUID,
        format,
        "Audio/01%20-%20Chapter%2001%20%26%20More.mp4",
      ),
      "Audio/01 - Chapter 01 & More.mp4",
    )
    resolvesTo(
      getLocalBookFileUrl(UUID, format, "Audio/It%27s_a.mp3"),
      "Audio/It's_a.mp3",
    )
    resolvesTo(
      getLocalBookFileUrl(UUID, format, "Audio/00000-00001-00002.mp4"),
      "Audio/00000-00001-00002.mp4",
    )
  },
)

test.each(["readaloud", "ebook", "audiobook"] as const)(
  `drops a media fragment from the href (%s)`,
  (format) => {
    resolvesTo(
      getLocalBookFileUrl(UUID, format, "Audio/01%20One.mp3#t=12.5"),
      "Audio/01 One.mp3",
    )
  },
)
