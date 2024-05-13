/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Entry,
  Reader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js"
import { XMLBuilder, XMLParser } from "fast-xml-parser"
import memoize, { memoizeClear } from "memoize"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path/posix"

export type XmlNode = Record<string, ParsedXml> & {
  ":@"?: Record<string, string>
  "#text"?: string
}

export type ParsedXml = Array<XmlNode>

export function isTextNode(
  node: XmlNode,
): node is XmlNode & { "#text": string } {
  return "#text" in node
}

export function findByName<Name extends string>(
  name: Name,
  xml: ParsedXml,
): (XmlNode & { [x in Name]: ParsedXml }) | undefined {
  const element = xml.find((e) => name in e)
  return element as (XmlNode & { [x in Name]: ParsedXml }) | undefined
}

export function getElementName(element: XmlNode): string {
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
    if (isTextNode(child)) {
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

  return body["body"]
}

export function addLink(
  xml: ParsedXml,
  link: { rel: string; href: string; type: string },
) {
  const html = findByName("html", xml)
  if (!html) throw new Error("Invalid XHTML document: no html element")

  const head = findByName("head", html.html)
  if (!head) throw new Error("Invalid XHTML document: no head element")

  head["head"].push({
    link: [],
    ":@": {
      "@_rel": link.rel,
      "@_href": link.href,
      "@_type": link.type,
    },
  } as unknown as XmlNode)
}

export function formatDuration(duration: number) {
  const hours = Math.floor(duration / 3600)
  const minutes = Math.floor(duration / 60 - hours * 60)
  const secondsAndMillis = duration - minutes * 60 - hours * 3600
  const [seconds, millis] = secondsAndMillis.toFixed(2).split(".")
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds!.padStart(2, "0")}.${millis ?? "0"}`
}

export type ManifestItem = {
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

  setData(data: Uint8Array) {
    this.data = data
  }

  constructor(entry: Entry | { filename: string; data: Uint8Array }) {
    this.filename = entry.filename
    if ("data" in entry) {
      this.data = entry.data
    } else {
      this.entry = entry
    }
  }
}

export type MetadataEntry = {
  id: string | undefined
  type: string
  properties: Record<string, string>
  value: string | undefined
}

export type EpubMetadata = MetadataEntry[]

export class Epub {
  static xmlParser = new XMLParser({
    allowBooleanAttributes: true,
    preserveOrder: true,
    ignoreAttributes: false,
  })

  static xhtmlParser = new XMLParser({
    allowBooleanAttributes: true,
    alwaysCreateTextNode: true,
    preserveOrder: true,
    ignoreAttributes: false,
    htmlEntities: true,
    trimValues: false,
    stopNodes: ["*.pre", "*.script"],
    parseTagValue: false,
    updateTag(_tagName, _jPath, attrs) {
      // There's never an attribute called "/";
      // this erroneously happens sometimes when parsing
      // self-closing stop nodes with ignoreAttributes: false
      // and allowBooleanAttributes: true.
      //
      // Also attrs is undefined if there are no attrs;
      // the types are wrong.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (attrs && "@_/" in attrs) {
        delete attrs["@_/"]
      }
      return true
    },
  })

  static xmlBuilder = new XMLBuilder({
    preserveOrder: true,
    format: true,
    ignoreAttributes: false,
    suppressEmptyNode: true,
  })

  static xhtmlBuilder = new XMLBuilder({
    preserveOrder: true,
    ignoreAttributes: false,
    stopNodes: ["*.pre", "*.script"],
    suppressEmptyNode: true,
  })

  private zipWriter: ZipWriter<Uint8Array>

  private dataWriter: Uint8ArrayWriter

  private zipReader: ZipReader<Uint8Array>

  private entries: ZipEntry[] = []

  private rootfile: string | null = null

  private manifest: Record<string, ManifestItem> | null = null

  private spine: string[] | null = null

  private constructor(dataReader: Reader<unknown>) {
    this.zipReader = new ZipReader(dataReader)
    this.dataWriter = new Uint8ArrayWriter()
    this.zipWriter = new ZipWriter(this.dataWriter)

    this.readXhtmlItemContents = memoize(this.readXhtmlItemContents.bind(this))
  }

  async close() {
    await this.zipReader.close()
    await this.zipWriter.close()
  }

  static async from(input: string | Reader<unknown>): Promise<Epub> {
    const dataReader =
      typeof input === "string"
        ? new Uint8ArrayReader(new Uint8Array((await readFile(input)).buffer))
        : input
    const epub = new Epub(dataReader)
    const entries = await epub.zipReader.getEntries()
    epub.entries = entries.map((entry) => new ZipEntry(entry))
    return epub
  }

  private getEntry(path: string) {
    const entries = this.entries
    return entries.find((entry) => entry.filename === path)
  }

  private async getFileData(path: string): Promise<Uint8Array>
  private async getFileData(path: string, encoding: "utf-8"): Promise<string>
  private async getFileData(
    path: string,
    encoding?: "utf-8" | undefined,
  ): Promise<string | Uint8Array> {
    const containerEntry = this.getEntry(path)

    if (!containerEntry)
      throw new Error(
        `Could not get file data for entry ${path}: entry not found`,
      )

    const containerContents = await containerEntry.getData()

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

    const containerDocument = Epub.xmlParser.parse(containerString) as ParsedXml
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
        element[":@"]?.["@_media-type"] === "application/oebps-package+xml",
    )

    if (!rootfile?.[":@"]?.["@_full-path"])
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

    const packageDocument = Epub.xmlParser.parse(
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
        [item[":@"]!["@_id"]!]: {
          id: item[":@"]!["@_id"]!,
          href: item[":@"]!["@_href"]!,
          mediaType: item[":@"]!["@_media-type"]!,
          mediaOverlay: item[":@"]!["@_media-overlay"],
          fallback: item[":@"]!["@_fallback"],
          properties: item[":@"]!["@_properties"]?.split(" "),
        },
      }),
      {},
    )

    return this.manifest
  }

  async getMetadata() {
    const packageDocument = await this.getPackageDocument()

    const packageElement = findByName("package", packageDocument)

    if (!packageElement)
      throw new Error(
        "Failed to parse EPUB: Found no package element in package document",
      )

    const metadataElement = findByName("metadata", packageElement.package)

    if (!metadataElement)
      throw new Error(
        "Failed to parse EPUB: Found no metadata element in package document",
      )

    const metadata: EpubMetadata = metadataElement.metadata.map((item) => {
      const elementName = getElementName(item)
      const id = item[":@"]?.["@_id"]
      const value = item[elementName]![0]?.["#text"]
      const attributes = item[":@"]
      const properties = Object.fromEntries(
        Object.entries(attributes ?? {}).map(([attrName, value]) => [
          attrName.slice(2),
          value,
        ]),
      )
      return {
        id,
        type: elementName,
        properties,
        value,
      }
    })

    return metadata
  }

  async getEpub2CoverImage() {
    const packageDocument = await this.getPackageDocument()

    const packageElement = findByName("package", packageDocument)

    if (!packageElement)
      throw new Error(
        "Failed to parse EPUB: Found no package element in package document",
      )

    const metadataElement = findByName("metadata", packageElement.package)

    if (!metadataElement)
      throw new Error(
        "Failed to parse EPUB: Found no metadata element in package document",
      )

    const coverImageElement = metadataElement.metadata.find(
      (element) => element[":@"]?.["@_name"] === "cover",
    )

    const manifestItemId = coverImageElement?.[":@"]?.["@_content"]
    if (!manifestItemId) return null

    const manifest = await this.getManifest()
    return (
      Object.values(manifest).find((item) => item.id === manifestItemId) ?? null
    )
  }

  async getCoverImage() {
    const manifest = await this.getManifest()
    const coverImage = Object.values(manifest).find((item) =>
      item.properties?.includes("cover-image"),
    )
    if (coverImage) return coverImage

    return this.getEpub2CoverImage()
  }

  async getTitle(short = false) {
    const metadata = await this.getMetadata()
    const titleEntries = metadata.filter((entry) => entry.type === "dc:title")
    if (titleEntries.length === 1 || short) return titleEntries[0]?.value

    const titleRefinements = metadata.filter(
      (entry) =>
        entry.type === "meta" &&
        entry.properties["refines"] &&
        (entry.properties["property"] === "title-type" ||
          entry.properties["property"] === "display-seq"),
    )

    const expandedTitle = titleEntries.find((titleEntry) => {
      if (!titleEntry.id) return false

      const refinement = titleRefinements.find(
        (refinement) =>
          refinement.properties["property"] === "title-type" &&
          refinement.properties["refines"]?.slice(1) === titleEntry.id,
      )

      return refinement?.value === "expanded"
    })

    if (expandedTitle) return expandedTitle.value

    const sortedTitleParts = titleEntries
      .filter(
        (titleEntry) =>
          titleEntry.id &&
          titleRefinements.some(
            (entry) =>
              entry.properties["refines"]?.slice(1) === titleEntry.id &&
              entry.properties["property"] === "display-seq" &&
              !Number.isNaN(parseInt(entry.value!, 10)),
          ),
      )
      .sort((a, b) => {
        const refinementA = titleRefinements.find(
          (entry) =>
            entry.properties["property"] === "display-seq" &&
            entry.properties["refines"]!.slice(1) === a.id,
        )!
        const refinementB = titleRefinements.find(
          (entry) =>
            entry.properties["property"] === "display-seq" &&
            entry.properties["refines"]!.slice(1) === b.id,
        )!
        const sortA = parseInt(refinementA.value!, 10)
        const sortB = parseInt(refinementB.value!, 10)
        return sortA - sortB
      })

    return (sortedTitleParts.length === 0 ? titleEntries : sortedTitleParts)
      .map((entry) => entry.value)
      .join(", ")
  }

  async getAuthors(): Promise<
    {
      name: string
      role: string | null
      fileAs: string
    }[]
  > {
    const metadata = await this.getMetadata()
    const creatorEntries = metadata.filter(
      (entry) => entry.type === "dc:creator" && entry.value,
    )
    const creatorRefinements = metadata.filter(
      (entry) =>
        entry.type === "meta" &&
        entry.properties["refines"] &&
        (entry.properties["property"] === "role" ||
          entry.properties["property"] === "file-as"),
    )

    return creatorEntries.map((creatorEntry) => {
      const name = creatorEntry.value!
      if (!creatorEntry.id) return { name, fileAs: name, role: null }

      const roleEntry = creatorRefinements.find(
        (entry) =>
          entry.properties["property"] === "role" &&
          entry.properties["refines"]?.slice(1) === creatorEntry.id,
      )
      const fileAsEntry = creatorRefinements.find(
        (entry) =>
          entry.properties["property"] === "file-as" &&
          entry.properties["refines"]?.slice(1) === creatorEntry.id,
      )

      return {
        name: name,
        role: roleEntry?.value ?? null,
        fileAs: fileAsEntry?.value ?? name,
      }
    })
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

    this.spine = spine["spine"].map((itemref) => itemref[":@"]!["@_idref"]!)

    return this.spine
  }

  async getSpineItems() {
    const spine = await this.getSpine()
    const manifest = await this.getManifest()

    return spine.map((itemref) => manifest[itemref]!)
  }

  /**
   * Returns a Zip Entry path for an HREF
   */
  private resolveHref(from: string, href: string) {
    const startPath = dirname(from)
    const absoluteStartPath = startPath.startsWith("/")
      ? startPath
      : `/${startPath}`

    return resolve(absoluteStartPath, href).slice(1)
  }

  async readItemContents(id: string): Promise<Uint8Array>
  async readItemContents(id: string, encoding: "utf-8"): Promise<string>
  async readItemContents(
    id: string,
    encoding?: "utf-8",
  ): Promise<string | Uint8Array> {
    const rootfile = await this.getRootfile()
    const manifest = await this.getManifest()
    const manifestItem = manifest[id]

    if (!manifestItem)
      throw new Error(`Could not find item with id "${id}" in manifest`)

    const path = this.resolveHref(rootfile, manifestItem.href)
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
    const xml = Epub.xhtmlParser.parse(contents) as ParsedXml
    if (as === "xhtml") return xml

    const body = getBody(xml)
    return textContent(body)
  }

  writeEntryContents(path: string, contents: Uint8Array): void
  writeEntryContents(path: string, contents: string, encoding: "utf-8"): void
  writeEntryContents(
    path: string,
    contents: Uint8Array | string,
    encoding?: "utf-8",
  ): void {
    const data =
      encoding === "utf-8"
        ? new TextEncoder().encode(contents as string)
        : (contents as Uint8Array)

    const entry = this.getEntry(path)

    if (!entry) throw new Error(`Could not find file at ${path} in EPUB`)

    entry.setData(data)
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
    const rootfile = await this.getRootfile()
    const manifest = await this.getManifest()
    const manifestItem = manifest[id]
    if (!manifestItem)
      throw new Error(`Could not find item with id "${id}" in manifest`)

    // readXhtmlItemContents is already explicitly bound in the constructor
    // eslint-disable-next-line @typescript-eslint/unbound-method
    memoizeClear(this.readXhtmlItemContents)
    const href = this.resolveHref(rootfile, manifestItem.href)
    if (encoding === "utf-8") {
      this.writeEntryContents(href, contents as string, encoding)
    } else {
      this.writeEntryContents(href, contents as Uint8Array)
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
        : (Epub.xhtmlBuilder.build(contents) as string)

    await this.writeItemContents(id, stringContents, "utf-8")
  }

  async addManifestItem(
    item: ManifestItem,
    contents: ParsedXml,
    encoding: "xml",
  ): Promise<void>
  async addManifestItem(
    item: ManifestItem,
    contents: string,
    encoding: "utf-8",
  ): Promise<void>
  async addManifestItem(item: ManifestItem, contents: Uint8Array): Promise<void>
  async addManifestItem(
    item: ManifestItem,
    contents: string | Uint8Array | ParsedXml,
    encoding?: "utf-8" | "xml",
  ): Promise<void> {
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

    manifest["manifest"].push({
      item: [],
      ":@": {
        "@_id": item.id,
        "@_href": item.href,
        "@_media-type": item.mediaType,
        ...(item.fallback && { "@_fallback": item.fallback }),
        ...(item.mediaOverlay && { "@_media-overlay": item.mediaOverlay }),
        ...(item.properties && { "@_properties": item.properties.join(" ") }),
      },
    } as unknown as XmlNode)

    const updatedPackageDocument = (await Epub.xmlBuilder.build(
      packageDocument,
    )) as string

    const rootfile = await this.getRootfile()

    this.writeEntryContents(rootfile, updatedPackageDocument, "utf-8")

    // Reset the cached manifest, so that it will be read from
    // the updated XML next time
    this.manifest = null

    const filename = this.resolveHref(rootfile, item.href)

    const data =
      encoding === "utf-8" || encoding === "xml"
        ? new TextEncoder().encode(
            encoding === "utf-8"
              ? (contents as string)
              : ((await Epub.xmlBuilder.build(
                  contents as ParsedXml,
                )) as string),
          )
        : (contents as Uint8Array)

    this.entries.push(new ZipEntry({ filename, data }))
  }

  async updateManifestItem(id: string, newItem: Omit<ManifestItem, "id">) {
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

    const itemIndex = manifest["manifest"].findIndex(
      (item) => item[":@"]?.["@_id"] === id,
    )

    manifest["manifest"].splice(itemIndex, 1, {
      item: [],
      ":@": {
        "@_id": id,
        "@_href": newItem.href,
        "@_media-type": newItem.mediaType,
        ...(newItem.fallback && { "@_fallback": newItem.fallback }),
        ...(newItem.mediaOverlay && {
          "@_media-overlay": newItem.mediaOverlay,
        }),
        ...(newItem.properties && {
          "@_properties": newItem.properties.join(" "),
        }),
      },
    } as unknown as XmlNode)

    const updatedPackageDocument = (await Epub.xmlBuilder.build(
      packageDocument,
    )) as string

    const rootfile = await this.getRootfile()

    this.writeEntryContents(rootfile, updatedPackageDocument, "utf-8")

    // Reset the cached manifest, so that it will be read from
    // the updated XML next time
    this.manifest = null
  }

  async addMetadata(
    name: string,
    attributes: Record<string, string>,
    value?: string,
  ) {
    const packageDocument = await this.getPackageDocument()

    const packageElement = findByName("package", packageDocument)
    if (!packageElement)
      throw new Error(
        "Failed to parse EPUB: found no package element in package document",
      )

    const metadata = findByName("metadata", packageElement.package)
    if (!metadata)
      throw new Error(
        "Failed to parse EPUB: found no metadata element in package document",
      )

    metadata.metadata.push({
      ":@": Object.fromEntries(
        Object.entries(attributes).map(([property, value]) => [
          `@_${property}`,
          value,
        ]),
      ),
      [name]: value !== undefined ? [{ "#text": value }] : [],
    } as unknown as XmlNode)

    const updatedPackageDocument = (await Epub.xmlBuilder.build(
      packageDocument,
    )) as string

    const rootfile = await this.getRootfile()

    this.writeEntryContents(rootfile, updatedPackageDocument, "utf-8")
  }

  async writeToFile(path: string) {
    let mimetypeEntry = this.getEntry("mimetype")
    if (!mimetypeEntry) {
      this.writeEntryContents("mimetype", "application/epub+zip", "utf-8")
      mimetypeEntry = this.getEntry("mimetype")!
    }

    const mimetypeReader = new Uint8ArrayReader(await mimetypeEntry.getData())
    await this.zipWriter.add(mimetypeEntry.filename, mimetypeReader, {
      level: 0,
      extendedTimestamp: false,
    })

    await Promise.all(
      this.entries.map(async (entry) => {
        if (entry.filename === "mimetype") return
        const reader = new Uint8ArrayReader(await entry.getData())
        return this.zipWriter.add(entry.filename, reader)
      }),
    )

    const data = await this.zipWriter.close()
    if (!data.length)
      throw new Error(
        "Failed to write zip archive to file; writer returned no data",
      )

    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)

    // Reset the ZipWriter to allow further modification
    this.dataWriter = new Uint8ArrayWriter()
    this.zipWriter = new ZipWriter(this.dataWriter)
  }
}
