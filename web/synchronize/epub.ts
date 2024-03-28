import {
  Entry,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js"
import { XMLBuilder, XMLParser } from "fast-xml-parser"
import { readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

type XmlElement = Record<string, ParsedXml> & {
  ":@": Record<string, string>
  "#text"?: string
}

type ParsedXml = Array<XmlElement>

function findByName<Name extends string>(
  name: Name,
  xml: ParsedXml,
): (XmlElement & { [x in Name]: ParsedXml }) | undefined {
  const element = xml.find((e) => name in e)
  return element as (XmlElement & { [x in Name]: ParsedXml }) | undefined
}

function getElementName(element: XmlElement): string {
  const keys = Object.keys(element)
  const elementName = keys.find((key) => key !== ":@" && key !== "#text")
  if (!elementName)
    throw new Error(
      `Invalid XML Element: missing tag name\n${JSON.stringify(element, null, 2)}`,
    )
  return elementName
}

export function textContent(xml: ParsedXml): string {
  let text = ""
  for (const child of xml) {
    if ("#text" in child) {
      text += child["#text"]
      continue
    }

    const elementName = getElementName(child)
    const children = child[elementName]!
    text += textContent(children)
  }
  return text
}

export function getBody(xml: ParsedXml): ParsedXml {
  const html = findByName("html", xml)
  if (!html) throw new Error("Invalid XHTML document: no html element")

  const body = findByName("body", html["html"])
  if (!body) throw new Error("Invalid XHTML document: No body element")

  return body["body"]!
}

type ManifestItem = {
  id: string
  href: string
  mediaType: string
  fallback?: string | undefined
  mediaOverlay?: string | undefined
  properties?: string[] | undefined
}

export class ZipEntry {
  filename: string

  private entry: Entry | null = null

  private data: Uint8Array | null = null

  async getData() {
    if (this.data) return this.data

    const writer = new Uint8ArrayWriter()
    const data = await this.entry!.getData!(writer)
    this.data = data
    return this.data
  }

  async setData(data: Uint8Array) {
    this.data = data
  }

  constructor(info: { filename: string; data: Uint8Array })
  constructor(entry: Entry)
  constructor(entry: Entry | { filename: string; data: Uint8Array }) {
    this.filename = entry.filename
    if ("data" in entry) {
      this.data = entry.data
    } else {
      this.entry = entry
    }
  }
}

export class Epub {
  private xmlParser = new XMLParser({
    allowBooleanAttributes: true,
    preserveOrder: true,
    ignoreAttributes: false,
  })

  private xhtmlParser = new XMLParser({
    allowBooleanAttributes: true,
    alwaysCreateTextNode: true,
    preserveOrder: true,
    ignoreAttributes: false,
    htmlEntities: true,
    trimValues: false,
    stopNodes: ["*.pre", "*.script"],
  })

  private xmlBuilder = new XMLBuilder({
    preserveOrder: true,
    ignoreAttributes: false,
  })

  private xhtmlBuilder = new XMLBuilder({
    preserveOrder: true,
    ignoreAttributes: false,
    stopNodes: ["*.pre", "*.script"],
  })

  private zipWriter: ZipWriter<Uint8Array>

  private dataWriter: Uint8ArrayWriter

  private zipReader: ZipReader<Uint8Array>

  private entries: ZipEntry[] = []

  private rootfile: string | null = null

  private manifest: Record<string, ManifestItem> | null = null

  private spine: string[] | null = null

  private constructor(data: Uint8Array) {
    const dataReader = new Uint8ArrayReader(data)
    this.zipReader = new ZipReader(dataReader)
    this.dataWriter = new Uint8ArrayWriter()
    this.zipWriter = new ZipWriter(this.dataWriter)
  }

  static async from(path: string) {
    const file = await readFile(path)
    const epub = new Epub(new Uint8Array(file.buffer))
    const entries = await epub.zipReader.getEntries()
    epub.entries = entries.map((entry) => new ZipEntry(entry))
    return epub
  }

  private getEntry(path: string) {
    const entries = this.entries
    return entries.find((entry) => entry.filename === path)
  }

  private async getFileData(path: string): Promise<Uint8Array | undefined>
  private async getFileData(path: string, encoding: "utf-8"): Promise<string>
  private async getFileData(
    path: string,
    encoding?: "utf-8" | undefined,
  ): Promise<string | Uint8Array | undefined> {
    const containerEntry = this.getEntry(path)

    const containerContents = await containerEntry?.getData()

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

    const containerDocument = this.xmlParser.parse(containerString) as ParsedXml
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

    const packageDocument = this.xmlParser.parse(
      packageDocumentString,
    ) as ParsedXml

    return packageDocument
  }

  async getManifest() {
    if (this.manifest !== null) return this.manifest

    const packageDocument = await this.getPackageDocument()

    const packageElement = findByName("package", packageDocument)

    if (!packageElement)
      throw new Error(
        "Failed to parse EPUB: Found no package element in package document",
      )

    const manifest = findByName("manifest", packageElement["package"])

    if (!manifest)
      throw new Error(
        "Failed to parse EPUB: Found no manifest element in package document",
      )

    this.manifest = manifest["manifest"].reduce<Record<string, ManifestItem>>(
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

    const packageElement = findByName("package", packageDocument)

    if (!packageElement)
      throw new Error(
        "Failed to parse EPUB: Found no package element in package document",
      )

    const spine = findByName("spine", packageElement["package"])

    if (!spine)
      throw new Error(
        "Failed to parse EPUB: Found no spine element in package document",
      )

    this.spine = spine["spine"].map((itemref) => itemref[":@"]["@_idref"]!)

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

  async readItemContents(id: string): Promise<Uint8Array | undefined>
  async readItemContents(id: string, encoding: "utf-8"): Promise<string>
  async readItemContents(
    id: string,
    encoding?: "utf-8",
  ): Promise<string | Uint8Array | undefined> {
    const manifest = await this.getManifest()
    const manifestItem = manifest[id]

    if (!manifestItem)
      throw new Error(`Could not find item with id "${id}" in manifest`)

    const path = await this.resolveHref(manifestItem.href)
    const itemEntry = encoding
      ? await this.getFileData(path, encoding)
      : await this.getFileData(path)
    return itemEntry
  }

  async readXhtmlItemContents(id: string, as?: "xhtml"): Promise<ParsedXml>
  async readXhtmlItemContents(id: string, as: "text"): Promise<string>
  async readXhtmlItemContents(
    id: string,
    as: "xhtml" | "text" = "xhtml",
  ): Promise<ParsedXml | string> {
    const contents = await this.readItemContents(id, "utf-8")
    const xml = this.xhtmlParser.parse(contents) as ParsedXml
    if (as === "xhtml") return xml

    const body = getBody(xml)
    return textContent(body)
  }

  async writeEntryContents(path: string, contents: Uint8Array): Promise<void>
  async writeEntryContents(
    path: string,
    contents: string,
    encoding: "utf-8",
  ): Promise<void>
  async writeEntryContents(
    path: string,
    contents: Uint8Array | string,
    encoding?: "utf-8",
  ): Promise<void> {
    const data =
      encoding === "utf-8"
        ? new TextEncoder().encode(contents as string)
        : (contents as Uint8Array)

    const entry = this.getEntry(path)

    if (!entry) throw new Error(`Could not find file at ${path} in EPUB`)

    entry?.setData(data)
  }

  async writeItemContents(id: string, contents: Uint8Array): Promise<void>
  async writeItemContents(
    id: string,
    contents: string,
    encoding: "utf-8",
  ): Promise<void>
  async writeItemContents(
    id: string,
    contents: Uint8Array | string,
    encoding?: "utf-8",
  ): Promise<void> {
    const manifest = await this.getManifest()
    const manifestItem = manifest[id]
    if (!manifestItem)
      throw new Error(`Could not find item with id "${id}" in manifest`)

    const href = await this.resolveHref(manifestItem.href)
    if (encoding === "utf-8") {
      await this.writeEntryContents(href, contents as string, encoding)
    } else {
      await this.writeEntryContents(href, contents as Uint8Array)
    }
  }

  async writeXhtmlItemContents(
    id: string,
    contents: ParsedXml,
    as?: "xhtml",
  ): Promise<void>
  async writeXhtmlItemContents(
    id: string,
    contents: string,
    as: "text",
  ): Promise<void>
  async writeXhtmlItemContents(
    id: string,
    contents: ParsedXml | string,
    as: "xhtml" | "text" = "xhtml",
  ): Promise<void> {
    const stringContents =
      as === "text"
        ? (contents as string)
        : (this.xhtmlBuilder.build(contents) as string)

    await this.writeItemContents(id, stringContents, "utf-8")
  }

  async addManifestItem(
    item: ManifestItem,
    contents: string,
    encoding: "utf-8",
  ): Promise<void>
  async addManifestItem(item: ManifestItem, contents: Uint8Array): Promise<void>
  async addManifestItem(
    item: ManifestItem,
    contents: string | Uint8Array,
    encoding?: "utf-8",
  ): Promise<void> {
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

    manifest["manifest"]!.push({
      item: [],
      ":@": {
        "@_id": item.id,
        "@_href": item.href,
        "@_media-type": item.mediaType,
        ...(item.fallback && { "@_fallback": item.fallback }),
        ...(item.mediaOverlay && { "@_media-overlay": item.mediaOverlay }),
        ...(item.properties && { "@_properties": item.properties.join(" ") }),
      },
    } as unknown as XmlElement)

    const updatedPackageDocument = (await this.xmlBuilder.build(
      packageDocument,
    )) as string

    const rootfile = await this.getRootfile()

    await this.writeEntryContents(rootfile, updatedPackageDocument, "utf-8")

    // Reset the cached manifest, so that it will be read from
    // the updated XML next time
    this.manifest = null

    const filename = await this.resolveHref(item.href)

    const data =
      encoding === "utf-8"
        ? new TextEncoder().encode(contents as string)
        : (contents as Uint8Array)

    this.entries.push(new ZipEntry({ filename, data }))
  }

  async writeToFile(path: string) {
    await Promise.all(
      this.entries.map(async (entry) => {
        const reader = new Uint8ArrayReader(await entry.getData())
        return this.zipWriter.add(entry.filename, reader)
      }),
    )

    const data = await this.zipWriter?.close()
    if (!data)
      throw new Error(
        "Failed to write zip archive to file; writer returned no data",
      )

    await writeFile(path, data)
  }
}
