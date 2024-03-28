import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"
import { XMLParser } from "fast-xml-parser"
import { readFile } from "node:fs/promises"
import { dirname } from "node:path"

type ParsedXml = Array<
  Record<string, ParsedXml> & { ":@": Record<string, string> }
>

type ManifestItem = {
  id: string
  href: string
  mediaType: string
  fallback?: string | undefined
  mediaOverlay?: string | undefined
  properties?: string[] | undefined
}

export class Epub {
  private parser = new XMLParser({
    allowBooleanAttributes: true,
    alwaysCreateTextNode: true,
    preserveOrder: true,
    ignoreAttributes: false,
  })

  private rootfile: string | null = null

  private manifest: Record<string, ManifestItem> | null = null

  private spine: string[] | null = null

  constructor(private zipReader: ZipReader<unknown>) {}

  private async getFileData(path: string): Promise<Uint8Array | undefined>
  private async getFileData(path: string, encoding: "utf-8"): Promise<string>
  private async getFileData(
    path: string,
    encoding?: "utf-8" | undefined,
  ): Promise<string | Uint8Array | undefined> {
    const entries = await this.zipReader.getEntries()
    const containerEntry = entries.find((entry) => entry.filename === path)

    const containerContents = await containerEntry?.getData<Uint8Array>?.(
      new Uint8ArrayWriter(),
    )

    return encoding === "utf-8"
      ? new TextDecoder("utf-8").decode(containerContents)
      : containerContents
  }

  private async getRootfile() {
    if (this.rootfile !== null) return this.rootfile

    const containerString = await this.getFileData(
      "META-INF/container.xml",
      "utf-8",
    )

    if (!containerString)
      throw new Error("Failed to parse EPUB: Missing META-INF/container.xml")

    const containerDocument = this.parser.parse(containerString) as ParsedXml
    const container = containerDocument.find(
      (element) => "container" in element,
    )

    if (!container)
      throw new Error(
        "Failed to parse EPUB container.xml: Found no container element",
      )

    const rootfiles = container["container"]!.find(
      (element) => "rootfiles" in element,
    )

    if (!rootfiles)
      throw new Error(
        "Failed to parse EPUB container.xml: Found no rootfiles element",
      )

    const rootfile = rootfiles["rootfiles"]!.find(
      (element) =>
        "rootfile" in element &&
        element[":@"]["@_media-type"] === "application/oebps-package+xml",
    )

    if (!rootfile?.[":@"]["@_full-path"])
      throw new Error(
        "Failed to parse EPUB container.xml: Found no rootfile element",
      )

    this.rootfile = rootfile[":@"]["@_full-path"]

    return this.rootfile
  }

  private async getPackageDocument() {
    const rootfile = await this.getRootfile()
    const packageDocumentString = await this.getFileData(rootfile, "utf-8")

    if (!packageDocumentString)
      throw new Error(
        `Failed to parse EPUB: could not find package document at ${rootfile}`,
      )

    const packageDocument = this.parser.parse(
      packageDocumentString,
    ) as ParsedXml

    return packageDocument
  }

  private async getManifest() {
    if (this.manifest !== null) return this.manifest

    const packageDocument = await this.getPackageDocument()

    const packageElement = packageDocument.find(
      (element) => "package" in element,
    )

    if (!packageElement)
      throw new Error(
        "Failed to parse EPUB: Found no package element in package document",
      )

    const manifest = packageElement["package"]!.find(
      (element) => "manifest" in element,
    )

    if (!manifest)
      throw new Error(
        "Failed to parse EPUB: Found no manifest element in package document",
      )

    this.manifest = manifest["manifest"]!.reduce<Record<string, ManifestItem>>(
      (acc, item) => ({
        ...acc,
        [item[":@"]["@_id"]!]: {
          id: item[":@"]["@_id"]!,
          href: item[":@"]["@_href"]!,
          mediaType: item[":@"]["@_media-type"]!,
          mediaOverlay: item[":@"]["@_media-overlay"],
          fallback: item[":@"]["@_fallback"],
          properties: item[":@"]["@_properties"]?.split(" "),
        },
      }),
      {},
    )

    return this.manifest
  }

  private async getSpine() {
    if (this.spine !== null) return this.spine

    const packageDocument = await this.getPackageDocument()

    const packageElement = packageDocument.find(
      (element) => "package" in element,
    )

    if (!packageElement)
      throw new Error(
        "Failed to parse EPUB: Found no package element in package document",
      )

    const spine = packageElement["package"]!.find(
      (element) => "spine" in element,
    )

    if (!spine)
      throw new Error(
        "Failed to parse EPUB: Found no spine element in package document",
      )

    this.spine = spine["spine"]!.map((itemref) => itemref[":@"]["@_idref"]!)

    return this.spine
  }

  async getSpineItems() {
    const spine = await this.getSpine()
    const manifest = await this.getManifest()

    return spine.map((itemref) => manifest[itemref]!)
  }

  private async resolveHref(href: string) {
    if (href.startsWith("/")) return href.slice(1)

    const rootfile = await this.getRootfile()
    const rootDir = dirname(rootfile)
    // TODO: This doesn't account for .. or . segments
    return [rootDir, href].join("/")
  }

  async readItemContents(href: string): Promise<Uint8Array | undefined>
  async readItemContents(href: string, encoding: "utf-8"): Promise<string>
  async readItemContents(
    href: string,
    encoding?: "utf-8",
  ): Promise<string | Uint8Array | undefined> {
    const path = await this.resolveHref(href)
    const itemEntry = encoding
      ? await this.getFileData(path, encoding)
      : await this.getFileData(path)
    return itemEntry
  }

  async readXhtmlItem(href: string) {
    const contents = await this.readItemContents(href, "utf-8")
    return this.parser.parse(contents) as ParsedXml
  }
}

export async function read(path: string): Promise<Epub> {
  const file = await readFile(path)
  const dataReader = new Uint8ArrayReader(new Uint8Array(file.buffer))
  const zipReader = new ZipReader(dataReader)
  return new Epub(zipReader)
}
