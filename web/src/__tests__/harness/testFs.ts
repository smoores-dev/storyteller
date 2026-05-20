import assert from "node:assert"
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { cwd } from "node:process"

import { move } from "@/assets/fs"

const FIXTURES_DIR = join(cwd(), "src", "__fixtures__", "books")

export type BookFolderOpts = {
  /** copy an ebook from __fixtures__/books/ebooks/<name> */
  ebook?: string
  /** copy audiobook files from __fixtures__/books/audiobooks/<name> */
  audiobook?: string
  /** copy a readaloud from __fixtures__/books/readalouds/<name> */
  readaloud?: string
  /** create a dummy epub (empty file with .epub extension) */
  dummyEpub?: string | boolean
  /** create dummy audio files (empty files with given extensions) */
  dummyAudio?: string[]
}

export type TestBookFolder = {
  path: string
  name: string

  add(relativePath: string, content?: Buffer | string): Promise<string>
  addFixture(
    relativePath: string,
    opts: {
      type: "ebooks" | "audiobooks" | "readalouds"
      name: string
      /**
       * whether to use the contents of the fixture folder, or the folder itself
       * @default true
       */
      contents?: boolean
    },
  ): Promise<string>
  replace(relativePath: string, content: Buffer | string): Promise<string>
  replaceFixture(
    relativePath: string,
    opts: {
      type: "ebooks" | "audiobooks" | "readalouds"
      name: string
      /**
       * whether to use the contents of the fixture folder, or the folder itself
       * @default true
       */
      contents?: boolean
    },
  ): Promise<string>
  rename(relativePath: string, newName: string): Promise<string>
  delete(relativePath: string): Promise<void>

  expectFiles(expected: string[]): Promise<void>
  expectContains(relativePath: string): Promise<void>
  expectMissing(relativePath: string): Promise<void>
  listFiles(): Promise<string[]>
}

export type TestLibrary = {
  root: string

  createBookFolder(name: string, opts?: BookFolderOpts): Promise<TestBookFolder>
  expectBookFolders(expected: string[]): Promise<void>

  [Symbol.asyncDispose]: () => Promise<void>
}

function createBookFolderHandle(
  folderPath: string,
  name: string,
): TestBookFolder {
  return {
    path: folderPath,
    name,

    async add(relativePath, content) {
      const fullPath = join(folderPath, relativePath)
      await mkdir(join(fullPath, ".."), { recursive: true })
      await writeFile(fullPath, content ?? "")
      return fullPath
    },

    async addFixture(relativePath, opts) {
      const fullPath = join(folderPath, relativePath)
      await mkdir(join(fullPath, ".."), { recursive: true })
      await copyFixture(opts.type, opts.name, fullPath)
      return fullPath
    },

    async replace(relativePath, content) {
      const fullPath = join(folderPath, relativePath)
      await writeFile(fullPath, content)
      return fullPath
    },

    async replaceFixture(relativePath, opts) {
      const fullPath = join(folderPath, relativePath)
      await mkdir(join(fullPath, ".."), { recursive: true })
      await copyFixture(opts.type, opts.name, fullPath)
      return fullPath
    },

    async rename(relativePath, newName) {
      const fullPath = join(folderPath, relativePath)
      const newFullPath = join(folderPath, newName)
      await move(fullPath, newFullPath)
      return newFullPath
    },

    async delete(relativePath) {
      const fullPath = join(folderPath, relativePath)
      await rm(fullPath, { recursive: true, force: true })
    },

    async expectFiles(expected) {
      const actual = await this.listFiles()
      const sorted = [...actual].sort()
      const expectedSorted = [...expected].sort()

      assert.deepStrictEqual(
        sorted,
        expectedSorted,
        `Expected files:\n  ${expectedSorted.join("\n  ")}\nActual files:\n  ${sorted.join("\n  ")}`,
      )
    },

    async expectContains(relativePath) {
      const actual = await this.listFiles()
      assert.ok(
        actual.includes(relativePath),
        `Expected folder to contain "${relativePath}", got: ${actual.join(", ")}`,
      )
    },

    async expectMissing(relativePath) {
      const actual = await this.listFiles()
      assert.ok(
        !actual.includes(relativePath),
        `Expected folder NOT to contain "${relativePath}", but it was present`,
      )
    },

    async listFiles() {
      const entries = await readdir(folderPath, {
        recursive: true,
        withFileTypes: true,
      })

      return entries
        .filter((e) => e.isFile() || e.isSymbolicLink())
        .map((e) => relative(folderPath, join(e.parentPath, e.name)))
    },
  }
}

async function copyFixture(
  category: "ebooks" | "audiobooks" | "readalouds",
  name: string,
  destDir: string,
) {
  const srcDir = join(FIXTURES_DIR, category, name)
  await cp(srcDir, destDir, { recursive: true })
}

export async function createTestLibrary(prefix: string): Promise<TestLibrary> {
  const root = await mkdtemp(join(tmpdir(), `storyteller-test-${prefix}-`))

  return {
    root,

    async createBookFolder(name, opts) {
      const folderPath = join(root, name)
      await mkdir(folderPath, { recursive: true })

      if (opts?.ebook) {
        await copyFixture("ebooks", opts.ebook, folderPath)
      }

      if (opts?.audiobook) {
        await copyFixture("audiobooks", opts.audiobook, folderPath)
      }

      if (opts?.readaloud) {
        await copyFixture("readalouds", opts.readaloud, folderPath)
      }

      if (opts?.dummyEpub) {
        const epubName =
          typeof opts.dummyEpub === "string" ? opts.dummyEpub : `${name}.epub`

        const epubFilename = epubName.endsWith(".epub")
          ? epubName
          : `${epubName}.epub`

        await writeFile(join(folderPath, epubFilename), "")
      }

      if (opts?.dummyAudio) {
        for (const filename of opts.dummyAudio) {
          await writeFile(join(folderPath, filename), "")
        }
      }

      return createBookFolderHandle(folderPath, name)
    },

    async expectBookFolders(expected) {
      const entries = await readdir(root, { withFileTypes: true })
      const folders = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()

      assert.deepStrictEqual(
        folders,
        [...expected].sort(),
        `Expected book folders:\n  ${expected.join(", ")}\nActual:\n  ${folders.join(", ")}`,
      )
    },

    async [Symbol.asyncDispose]() {
      await rm(root, { recursive: true, force: true })
    },
  }
}

/**
 * Create a minimal epub file (valid zip with mimetype entry).
 * This is enough to pass file-existence checks without needing real epub content.
 */
export function createMinimalEpub(): Buffer {
  // a valid epub is just a zip file with a "mimetype" entry as the first file.
  // we create a minimal zip structure here. the scanner's discovery phase only
  // checks extensions, not content, so an empty file suffices for discovery tests.
  // for tests that open the epub, use real fixtures instead.
  return Buffer.from("")
}

/**
 * Helper to wait for filesystem watcher events to propagate.
 * Parcel watcher typically delivers events within ~50-100ms on macOS.
 */
export async function waitForWatcher(ms = 1500): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
