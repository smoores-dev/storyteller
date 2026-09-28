import assert from "node:assert"
import { openAsBlob, readdirSync } from "node:fs"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, it } from "vitest"
import { ZipFile } from "yazl"

import type { ArchiveSource } from "./adapters/interface.ts"
import { TmpFsAdapter } from "./adapters/tmpfs.ts"
import * as zipBrowser from "./zip.browser.ts"
import * as zipNode from "./zip.node.ts"

const readers = { "zip.node.ts": zipNode, "zip.browser.ts": zipBrowser }

const decoder = new TextDecoder()

async function writeTemp(data: Buffer): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "epub-zip-test-")), "a.epub")
  await writeFile(path, data)
  return path
}

async function sources(data: Buffer): Promise<Record<string, ArchiveSource>> {
  const path = await writeTemp(data)
  return { path, buffer: data, blob: await openAsBlob(path) }
}

const text = Array.from(
  { length: 4000 },
  (_, i) => `line ${i} ${(i * 7919) % 1000}`,
).join("\n")

async function buildZip(): Promise<Buffer> {
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from(text), "stored.txt", { compress: false })
  zip.addBuffer(Buffer.from(text), "deflated.txt", { compress: true })
  zip.addEmptyDirectory("empty/")
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

function corrupt(zip: Buffer, name: string): Buffer {
  const copy = Buffer.from(zip)
  const header = copy.indexOf(name) - 30
  const dataStart =
    header +
    30 +
    copy.readUInt16LE(header + 26) +
    copy.readUInt16LE(header + 28)
  const compressedSize = copy.readUInt32LE(copy.lastIndexOf(name) - 46 + 20)
  const target = dataStart + Math.floor(compressedSize / 2)
  copy.writeUInt8(copy.readUInt8(target) ^ 1, target)
  return copy
}

for (const [readerName, { openZip }] of Object.entries(readers)) {
  describe(readerName, () => {
    it("lists files and reads them from a path, a buffer and a blob", async () => {
      for (const [kind, source] of Object.entries(
        await sources(await buildZip()),
      )) {
        const zip = await openZip(source)
        try {
          assert.deepStrictEqual(
            zip.entries.map((entry) => entry.filename),
            ["stored.txt", "deflated.txt"],
            kind,
          )
          for (const entry of zip.entries) {
            assert.strictEqual(decoder.decode(await entry.read()), text, kind)
            assert.strictEqual(entry.uncompressedSize, text.length, kind)
          }
        } finally {
          await zip.close()
        }
      }
    })

    it("opens archives with junk after the end of central directory record", async () => {
      const intact = await readFile(join("__fixtures__", "moby-dick.epub"))
      const junked = Buffer.concat([intact, Buffer.from([0x3c, 0x34])])
      for (const [kind, source] of Object.entries(await sources(junked))) {
        const zip = await openZip(source)
        try {
          const container = zip.entries.find(
            (entry) => entry.filename === "META-INF/container.xml",
          )
          assert.ok(container, kind)
          assert.match(decoder.decode(await container.read()), /rootfile/, kind)
        } finally {
          await zip.close()
        }
      }
    })

    for (const name of ["stored.txt", "deflated.txt"]) {
      it(`rejects reading ${name} when its data no longer matches the checksum`, async () => {
        for (const [kind, source] of Object.entries(
          await sources(corrupt(await buildZip(), name)),
        )) {
          const zip = await openZip(source)
          try {
            const entry = zip.entries.find((entry) => entry.filename === name)
            assert.ok(entry, kind)
            await assert.rejects(entry.read(), kind)
          } finally {
            await zip.close()
          }
        }
      })
    }
  })
}

describe("zip.node.ts file handles", () => {
  const openFds = () => readdirSync("/dev/fd").length

  it("closes the file when an archive with a junk tail is retried or fails to open", async () => {
    const intact = await readFile(join("__fixtures__", "moby-dick.epub"))
    const junked = await writeTemp(
      Buffer.concat([intact, Buffer.from([0x3c, 0x34])]),
    )
    const garbage = await writeTemp(Buffer.alloc(4096, 7))

    const before = openFds()
    for (let i = 0; i < 20; i++) {
      await (await zipNode.openZip(junked)).close()
      await assert.rejects(zipNode.openZip(garbage))
    }
    assert.strictEqual(openFds(), before)
  })
})

describe("TmpFsAdapter", () => {
  for (const name of ["stored.txt", "deflated.txt"]) {
    it(`rejects extracting ${name} when its data no longer matches the checksum`, async () => {
      await assert.rejects(TmpFsAdapter.init(corrupt(await buildZip(), name)))
    })
  }
})
