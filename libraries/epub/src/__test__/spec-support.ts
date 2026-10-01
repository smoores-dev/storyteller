/**
 * Shared helpers for the EPUB 3.3 conformance suites (`spec-*.test.ts`).
 *
 * Every assertion in those suites cites the section of the specification it
 * comes from: https://www.w3.org/TR/epub-33/
 *
 * Two ways of producing a publication are used:
 *
 * - `buildZip()` hand-authors the archive. Used for the reading side, so a
 *   spec-conforming document that the library must accept is not itself
 *   produced by the code under test.
 * - `createPublication()` drives the public writing API and returns the bytes
 *   that were saved, for the writing side.
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import { fromBuffer } from "yauzl-promise"
import { ZipFile } from "yazl"

import { scratchPath } from "@storyteller-platform/fs"

import { Epub, TmpFsAdapter } from "../index.tsx"
import { x } from "../xml.ts"

export const SPEC_URL = "https://www.w3.org/TR/epub-33/"

export const DC_NS = "http://purl.org/dc/elements/1.1/"
export const OPF_NS = "http://www.idpf.org/2007/opf"
export const EPUB_NS = "http://www.idpf.org/2007/ops"
export const CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
export const XHTML_NS = "http://www.w3.org/1999/xhtml"
export const MIMETYPE = "application/epub+zip"

/** Compression methods allowed by 4.3.2. */
export const STORED = 0
export const DEFLATED = 8

export type ZipEntry = {
  /** Position in the central directory; 0 for the first entry. */
  index: number
  filename: string
  compressionMethod: number
  text: string
}

/**
 * A minimal EPUB 3.3 package document.
 *
 * By default the OPF namespace is the default namespace. Set `prefixed` to put
 * it on an `opf:` prefix instead, which is equally conforming and is what many
 * in-the-wild tools emit.
 */
export function packageXml(
  options: {
    uniqueIdentifierId?: string
    version?: string
    metadata?: string
    manifest?: string
    spine?: string
    packageAttributes?: string
    prefixed?: boolean
  } = {},
): string {
  const uid = options.uniqueIdentifierId ?? "pub-id"
  const version = options.version ?? "3.0"
  const p = options.prefixed ? "opf:" : ""
  const nsDecl = options.prefixed
    ? `xmlns:opf="${OPF_NS}"`
    : `xmlns="${OPF_NS}"`

  return `<?xml version="1.0" encoding="UTF-8"?>
<${p}package xmlns:dc="${DC_NS}" ${nsDecl} xmlns:epub="${EPUB_NS}" version="${version}" unique-identifier="${uid}"${options.packageAttributes ? " " + options.packageAttributes : ""}>
  <${p}metadata>
${options.metadata ?? "    "}
  </${p}metadata>
  <${p}manifest>
${options.manifest ?? "    "}
  </${p}manifest>
  <${p}spine>
${options.spine ?? "    "}
  </${p}spine>
</${p}package>
`
}

/** The four metadata entries every package document must carry (5.5.3). */
export const REQUIRED_METADATA = `    <dc:identifier id="pub-id">urn:uuid:0b1a7dd4-8f0e-4f2a-9c1d-2d5e6a7b8c9d</dc:identifier>
    <dc:title>Conformance Fixture</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2020-01-01T00:00:00Z</meta>`

/** A conforming EPUB navigation document. */
export function navDocument(
  options: {
    tocItems?: string
    extraNavs?: string
  } = {},
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}" xml:lang="en">
<head><title>Navigation</title></head>
<body>
<nav epub:type="toc">
  <h1>Contents</h1>
  <ol>
${options.tocItems ?? '    <li><a href="chapter1.xhtml">Chapter One</a></li>'}
  </ol>
</nav>
${options.extraNavs ?? ""}
</body>
</html>
`
}

export function chapterDocument(title = "Chapter One"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="${XHTML_NS}" xml:lang="en">
<head><title>${title}</title></head>
<body><h1>${title}</h1><p>Text.</p></body>
</html>
`
}

/**
 * Hand-author an archive. `mimetype` is written first and uncompressed as the
 * spec requires, so tests about the library's own output are not polluted by
 * an invalid fixture.
 */
export async function buildZip(
  entries: Record<string, string | Buffer>,
): Promise<Buffer> {
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from(MIMETYPE), "mimetype", { compress: false })
  for (const [name, contents] of Object.entries(entries)) {
    zip.addBuffer(
      Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
      name,
    )
  }
  zip.end()
  const chunks: Buffer[] = []
  for await (const chunk of zip.outputStream) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** Read every central-directory entry, in archive order. */
export async function readZipEntries(buffer: Buffer): Promise<ZipEntry[]> {
  const archive = await fromBuffer(buffer)
  const out: ZipEntry[] = []
  let index = 0
  for await (const entry of archive) {
    const stream = await entry.openReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    out.push({
      index: index++,
      filename: entry.filename,
      compressionMethod: entry.compressionMethod,
      text: Buffer.concat(chunks).toString("utf-8"),
    })
  }
  return out
}

export async function tempPath(name: string): Promise<string> {
  const dir = scratchPath(`epub-spec-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  return join(dir, name)
}

/**
 * Run a mutation through the writing API, returning `null` if the library
 * refused it.
 *
 * The specification binds "EPUB creators" rather than this library, so refusing
 * an operation that would produce a non-conformant document satisfies the same
 * requirement as writing a corrected one. Callers treat `null` as a conformant
 * outcome and only assert the invariant on bytes that were actually written.
 */
export async function tryBuild(
  mutate: (epub: Epub) => Promise<void>,
): Promise<Buffer | null> {
  try {
    const { buffer } = await createPublication(mutate)
    return buffer
  } catch {
    return null
  }
}

/**
 * Drive the public writing API to produce a publication with real content, then
 * return the bytes that were written to disk.
 *
 * 5.7.1 requires at least one content document in the spine and 7.2 requires a
 * navigation document, so a bare `Epub.create()` result is not a publication an
 * author would ship; this adds the minimum content a conforming author adds.
 */
export async function createPublication(
  mutate: ((epub: Epub) => Promise<void>) | null = null,
): Promise<{ path: string; buffer: Buffer; epub: Epub }> {
  const path = await tempPath("publication.epub")

  const epub = await Epub.using(TmpFsAdapter).create(path, {
    title: "Conformance Test",
    language: new Intl.Locale("en-US"),
    identifier: "urn:uuid:1e4f6a2c-63d1-4c86-9f0e-6b9b1f0c1a11",
  })

  // A navigation document, declared as such in the manifest (5.6 "MUST declare
  // exactly one item as the EPUB navigation document").
  const nav = await epub.createXhtmlDocument(
    [
      x(
        "nav",
        { "epub:type": "toc" },
        x("h1", null, "Contents"),
        x(
          "ol",
          null,
          x("li", null, x("a", { href: "chapter1.xhtml" }, "Chapter One")),
        ),
      ),
    ],
    [x("title", null, "Navigation")],
  )

  await epub.addManifestItem(
    {
      id: "nav",
      href: "nav.xhtml",
      mediaType: "application/xhtml+xml",
      properties: ["nav"],
    },
    nav,
    "xml",
  )

  await epub.addManifestItem(
    {
      id: "chapter1",
      href: "chapter1.xhtml",
      mediaType: "application/xhtml+xml",
    },
    chapterDocument(),
    "utf-8",
  )

  await epub.addSpineItem("chapter1")

  if (mutate) await mutate(epub)

  await epub.saveAndClose()

  return { path, buffer: await readFile(path), epub }
}
