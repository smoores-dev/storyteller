import { randomUUID } from "node:crypto"
import { rmSync } from "node:fs"
import { cp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

import { type NativePath, PortablePath, npath, ppath } from "@yarnpkg/fslib"
import { DEFAULT_COMPRESSION_LEVEL, ZipFS } from "@yarnpkg/libzip"
import { Mutex } from "async-mutex"
import { XMLBuilder, XMLParser } from "fast-xml-parser"
import memoize from "mem"
import { lookup } from "mime-types"
import { nanoid } from "nanoid"

/*
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo
 * Node.js and Deno both have a non-standard implementation of
 * the Intl.Locale spec's getTextInfo(), providing the textInfo
 * accessor instead.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Intl {
    interface Locale {
      textInfo: { direction: "rtl" | "ltr" }
    }
  }
}

type Letter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"

type QuestionMark = "?"

/** A valid name for an XML element (must start with a letter) */
export type ElementName =
  `${Letter | Uppercase<Letter> | QuestionMark}${string}`

type PropertyPrefix = "@_"

/** An XML element */
export type XmlElement<Name extends ElementName = ElementName> = {
  ":@"?: Record<`${PropertyPrefix}${string}`, string>
} & {
  [key in Name]: ParsedXml
}

/** A text node in an XML document */
export type XmlTextNode = { "#text": string }

/** A valid XML node. May be either an element or a text node. */
export type XmlNode = XmlElement | XmlTextNode

/** An XML structure */
export type ParsedXml = Array<XmlNode>

export type ManifestItem = {
  id: string
  href: string
  mediaType?: string | undefined
  fallback?: string | undefined
  mediaOverlay?: string | undefined
  properties?: string[] | undefined
}

export type MetadataEntry = {
  id?: string | undefined
  type: ElementName
  properties: Record<string, string>
  value: string | undefined
}

export type EpubMetadata = MetadataEntry[]

export interface DcSubject {
  value: string
  authority: string
  term: string
}

export interface AlternateScript {
  name: string
  locale: Intl.Locale
}

export interface DcCreator {
  name: string
  role?: string
  roleScheme?: string
  fileAs?: string
  alternateScripts?: AlternateScript[]
}

export interface DublinCore {
  title: string
  language: Intl.Locale
  identifier: string
  date?: Date
  subjects?: Array<string | DcSubject>
  creators?: DcCreator[]
  contributors?: DcCreator[]
  type?: string
}

export interface Collection {
  name: string
  type?: string
  position?: string
}

export type PackageElement = XmlElement<"package"> | XmlElement<"opf:package">

/**
 * A single EPUB instance.
 *
 * The entire EPUB contents will be read into memory.
 *
 * Example usage:
 *
 * ```ts
 * import { Epub, getBody, findByName, textContent } from '@storyteller-platform/epub';
 *
 * const epub = await Epub.from('./path/to/book.epub');
 * const title = await epub.getTitle();
 * const spineItems = await epub.getSpineItems();
 * const chptOne = spineItems[0];
 * const chptOneXml = await epub.readXhtmlItemContents(chptOne.id);
 *
 * const body = getBody(chptOneXml);
 * const h1 = Epub.findXmlChildByName('h1', body);
 * const headingText = textContent(h1);
 *
 * await epub.setTitle(headingText);
 * await epub.writeToFile('./path/to/updated.epub');
 * await epub.close();
 * ```
 *
 * @link https://www.w3.org/TR/epub-33/
 */
export class Epub {
  static xmlParser = new XMLParser({
    allowBooleanAttributes: true,
    preserveOrder: true,
    ignoreAttributes: false,
    parseTagValue: false,
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
      // There's never an attribute called '/';
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

  /**
   * Format a duration, provided as a number of seconds, as
   * a SMIL clock value, to be used for Media Overlays.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-duration
   */
  static formatSmilDuration(duration: number) {
    const hours = Math.floor(duration / 3600)
    const minutes = Math.floor(duration / 60 - hours * 60)
    const secondsAndMillis = duration - minutes * 60 - hours * 3600
    const [seconds, millis] = secondsAndMillis.toFixed(2).split(".")
    // It's not actually possible for .split() to return fewer than one
    // item, so it's safe to assert that seconds is a defined string
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds!.padStart(2, "0")}.${millis ?? "0"}`
  }

  /**
   * Given an XML structure representing a complete XHTML document,
   * add a `link` element to the `head` of the document.
   *
   * This method modifies the provided XML structure.
   */
  static addLinkToXhtmlHead(
    xml: ParsedXml,
    link: { rel: string; href: string; type: string },
  ) {
    const html = Epub.findXmlChildByName("html", xml)
    if (!html) throw new Error("Invalid XHTML document: no html element")

    const head = Epub.findXmlChildByName("head", html.html)
    if (!head) throw new Error("Invalid XHTML document: no head element")

    head["head"].push({
      link: [],
      ":@": {
        "@_rel": link.rel,
        "@_href": link.href,
        "@_type": link.type,
      },
    })
  }

  /**
   * Given an XML structure representing a complete XHTML document,
   * return the sub-structure representing the children of the
   * document's body element.
   */
  static getXhtmlBody(xml: ParsedXml): ParsedXml {
    const html = Epub.findXmlChildByName("html", xml)
    if (!html) throw new Error("Invalid XHTML document: no html element")

    const body = Epub.findXmlChildByName("body", html["html"])
    if (!body) throw new Error("Invalid XHTML document: No body element")

    return body["body"]
  }

  static createXmlElement<Name extends ElementName>(
    name: Name,
    properties: Record<string, string>,
    children: XmlNode[] = [],
  ): XmlElement<Name> {
    return {
      ":@": Object.fromEntries(
        Object.entries(properties).map(([prop, value]) => [`@_${prop}`, value]),
      ),
      [name]: children,
    } as XmlElement<Name>
  }

  static createXmlTextNode(text: string): XmlTextNode {
    return { ["#text"]: text }
  }

  /**
   * Given an XML structure representing a complete XHTML document,
   * return a string representing the concatenation of all text nodes
   * in the document.
   */
  static getXhtmlTextContent(xml: ParsedXml): string {
    let text = ""
    for (const child of xml) {
      if (Epub.isXmlTextNode(child)) {
        text += child["#text"]
        continue
      }

      const children = Epub.getXmlChildren(child)
      text += Epub.getXhtmlTextContent(children)
    }
    return text
  }

  /**
   * Given an XMLElement, return its tag name.
   */
  static getXmlElementName<Name extends ElementName>(
    element: XmlElement<Name>,
  ): Name {
    const keys = Object.keys(element)
    const elementName = keys.find((key) => key !== ":@" && key !== "#text")
    if (!elementName)
      throw new Error(
        `Invalid XML Element: missing tag name\n${JSON.stringify(element, null, 2)}`,
      )
    return elementName as Name
  }

  /**
   * Given an XMLElement, return a list of its children
   */
  static getXmlChildren<Name extends ElementName>(
    element: XmlElement<Name>,
  ): ParsedXml {
    const elementName = Epub.getXmlElementName(element)
    // It's not clear to me why this needs to be cast
    return element[elementName] as ParsedXml
  }

  static replaceXmlChildren<Name extends ElementName>(
    element: XmlElement<Name>,
    children: XmlNode[],
  ): void {
    const elementName = Epub.getXmlElementName(element)
    element[elementName] = children as XmlElement<Name>[Name]
  }

  /**
   * Given an XML structure, find the first child matching
   * the provided name and optional filter.
   */
  static findXmlChildByName<Name extends ElementName>(
    name: Name,
    xml: ParsedXml,
    filter?: (node: XmlNode) => boolean,
  ): XmlElement<Name> | undefined {
    const element = xml.find((e) => name in e && (filter ? filter(e) : true))
    return element as XmlElement<Name> | undefined
  }

  /**
   * Given an XMLNode, determine whether it represents
   * a text node or an XML element.
   */
  static isXmlTextNode(node: XmlNode): node is XmlTextNode {
    return "#text" in node
  }

  private rootfile: PortablePath | null = null

  private manifest: Record<string, ManifestItem> | null = null

  private spine: string[] | null = null

  private packageMutex = new Mutex()

  protected constructor(
    protected zipFs: ZipFS,
    protected zipPath: NativePath,
    protected inputPath: string | undefined,
  ) {
    this.readXhtmlItemContents = memoize(
      this.readXhtmlItemContents.bind(this),
      // This isn't unnecessary, the generic here just isn't handling the
      // overloaded method type correctly
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      { cacheKey: ([id, as]) => `${id}:${as ?? "xhtml"}` },
    )
  }

  /**
   * Construct an Epub instance, optionally beginning
   * with the provided metadata.
   *
   * @param dublinCore Core metadata terms
   * @param additionalMetadata An array of additional metadata entries
   */
  static async create(
    path: string,
    {
      title,
      language,
      identifier,
      date,
      subjects,
      type,
      creators,
      contributors,
    }: DublinCore,
    additionalMetadata: EpubMetadata = [],
  ): Promise<Epub> {
    const tmp = npath.join(
      tmpdir(),
      `storyteller-platform-epub-${randomUUID()}.epub`,
    )
    const zipFs = new ZipFS(npath.toPortablePath(tmp), { create: true })
    const encoder = new TextEncoder()
    const container = encoder.encode(`<?xml version="1.0"?>
<container>
  <rootfiles>
    <rootfile media-type="application/oebps-package+xml" full-path="OEBPS/content.opf"/>
  </rootfiles>
</container>
`)
    await zipFs.mkdirpPromise(ppath.join(PortablePath.root, "META-INF"))
    await zipFs.writeFilePromise(
      ppath.join(PortablePath.root, "META-INF", "container.xml"),
      container,
    )

    const packageDocument = encoder.encode(`<?xml version="1.0"?>
<package unique-identifier="pub-id" dir="${language.textInfo.direction}" xml:lang=${language.toString()} version="3.0">
  <metadata>
  </metadata>
  <manifest>
  </manifest>
  <spine>
  </spine>
</package>
`)
    await zipFs.mkdirpPromise(ppath.join(PortablePath.root, "OEBPS"))
    await zipFs.writeFilePromise(
      ppath.join(PortablePath.root, "OEBPS", "content.opf"),
      packageDocument,
    )

    const epub = new this(zipFs, tmp, path)
    const metadata: MetadataEntry[] = [
      {
        id: "pub-id",
        type: "dc:identifier",
        properties: {},
        value: identifier,
      },
      ...additionalMetadata,
    ]

    await Promise.all(metadata.map((entry) => epub.addMetadata(entry)))

    await epub.setTitle(title)
    await epub.setLanguage(language)

    if (date) await epub.setPublicationDate(date)
    if (type) await epub.setType(type)
    if (subjects) {
      await Promise.all(subjects.map((subject) => epub.addSubject(subject)))
    }
    if (creators) {
      await Promise.all(creators.map((creator) => epub.addCreator(creator)))
    }
    if (contributors) {
      await Promise.all(
        contributors.map((contributor) => epub.addCreator(contributor)),
      )
    }

    return epub
  }

  /**
   * Construct an Epub instance by reading an existing EPUB
   * publication.
   *
   * @param pathOrData Must be either a string representing the
   *        path to an EPUB file on disk, or a Uint8Array representing
   *        the data of the EPUB publication.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  static async from(pathOrData: string | Uint8Array): Promise<Epub> {
    const tmp = npath.join(
      tmpdir(),
      `storyteller-platform-epub-${randomUUID()}.epub`,
    )
    if (typeof pathOrData !== "string") {
      await writeFile(tmp, pathOrData)
    } else {
      await cp(pathOrData, tmp)
    }
    const zipFs = new ZipFS(npath.toPortablePath(tmp))
    return new this(
      zipFs,
      tmp,
      typeof pathOrData === "string" ? pathOrData : undefined,
    )
  }

  private async removeEntry(href: string) {
    const rootfile = await this.getRootfile()

    const filename = this.resolveHref(rootfile, href)

    await this.zipFs.removePromise(filename)
  }

  private async getFileData(path: PortablePath): Promise<Uint8Array>
  private async getFileData(
    path: PortablePath,
    encoding: "utf-8",
  ): Promise<string>
  private async getFileData(
    path: PortablePath,
    encoding?: "utf-8",
  ): Promise<string | Uint8Array> {
    return await this.zipFs.readFilePromise(path, encoding)
  }

  private async getRootfile() {
    if (this.rootfile !== null) return this.rootfile

    const containerString = await this.getFileData(
      ppath.join(PortablePath.root, "META-INF", "container.xml"),
      "utf-8",
    )

    if (!containerString)
      throw new Error("Failed to parse EPUB: Missing META-INF/container.xml")

    const containerDocument = Epub.xmlParser.parse(containerString) as ParsedXml
    const container = Epub.findXmlChildByName("container", containerDocument)

    if (!container)
      throw new Error(
        "Failed to parse EPUB container.xml: Found no container element",
      )

    const rootfiles = Epub.findXmlChildByName(
      "rootfiles",
      Epub.getXmlChildren(container),
    )

    if (!rootfiles)
      throw new Error(
        "Failed to parse EPUB container.xml: Found no rootfiles element",
      )

    const rootfile = Epub.findXmlChildByName(
      "rootfile",
      Epub.getXmlChildren(rootfiles),
      (node) =>
        !Epub.isXmlTextNode(node) &&
        node[":@"]?.["@_media-type"] === "application/oebps-package+xml",
    )

    const fullPath = rootfile?.[":@"]?.["@_full-path"]
    if (!fullPath)
      throw new Error(
        "Failed to parse EPUB container.xml: Found no rootfile element",
      )

    this.rootfile = ppath.resolve(PortablePath.root, fullPath)

    return this.rootfile
  }

  private migratePackageDocument(packageDocument: ParsedXml) {
    for (const element of packageDocument) {
      if (Epub.isXmlTextNode(element)) continue
      const elementName = Epub.getXmlElementName(element)
      if (elementName.startsWith("opf:")) {
        element[elementName.replace("opf:", "") as ElementName] =
          Epub.getXmlChildren(element)
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete element[elementName]
        this.migratePackageDocument(Epub.getXmlChildren(element))
      }
    }
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

  private async getPackageElement() {
    const packageDocument = await this.getPackageDocument()

    const packageElement =
      Epub.findXmlChildByName("package", packageDocument) ??
      Epub.findXmlChildByName("opf:package", packageDocument)

    if (!packageElement) {
      throw new Error(
        "Failed to parse EPUB: Found no package element in package document",
      )
    }

    this.migratePackageDocument(packageDocument)

    return packageElement as XmlElement<"package">
  }

  /**
   * Safely modify the package document, without race conditions.
   *
   * Since the reading the package document is an async process,
   * multiple simultaneously dispatched function calls that all
   * attempt to modify it can clobber each other's changes. This
   * method uses a mutex to ensure that each update runs exclusively.
   *
   * @param producer The function to update the package document. If
   *    it returns a new package document, that will be persisted, otherwise
   *    it will be assumed that the package document was modified in place.
   */
  private async withPackage(
    producer:
      | ((packageElement: PackageElement) => void)
      | ((packageElement: PackageElement) => PackageElement)
      | ((packageElement: PackageElement) => Promise<PackageElement>)
      | ((packageElement: PackageElement) => Promise<void>),
  ) {
    await this.packageMutex.runExclusive(async () => {
      const packageDocument = await this.getPackageDocument()

      const packageElement =
        Epub.findXmlChildByName("package", packageDocument) ??
        Epub.findXmlChildByName("opf:package", packageDocument)

      if (!packageElement) {
        throw new Error(
          "Failed to parse EPUB: Found no package element in package document",
        )
      }

      const produced = (await producer(packageElement)) as ParsedXml | undefined

      const updatedPackageDocument = (await Epub.xmlBuilder.build(
        produced ?? packageDocument,
      )) as string

      const rootfile = await this.getRootfile()

      await this.writeEntryContents(rootfile, updatedPackageDocument, "utf-8")
    })
  }

  /**
   * Retrieve the manifest for the Epub.
   *
   * This is represented as a map from each manifest items'
   * id to the rest of its properties.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-pkg-manifest
   */
  async getManifest() {
    if (this.manifest !== null) return this.manifest

    const packageElement = await this.getPackageElement()

    const manifest = Epub.findXmlChildByName(
      "manifest",
      Epub.getXmlChildren(packageElement),
    )

    if (!manifest)
      throw new Error(
        "Failed to parse EPUB: Found no manifest element in package document",
      )

    this.manifest = Epub.getXmlChildren(manifest).reduce<
      Record<string, ManifestItem>
    >((acc, item) => {
      if (Epub.isXmlTextNode(item)) return acc

      if (!item[":@"]?.["@_id"] || !item[":@"]["@_href"]) {
        return acc
      }

      return {
        ...acc,
        [item[":@"]["@_id"]]: {
          id: item[":@"]["@_id"],
          href: item[":@"]["@_href"],
          mediaType: item[":@"]["@_media-type"],
          mediaOverlay: item[":@"]["@_media-overlay"],
          fallback: item[":@"]["@_fallback"],
          properties: item[":@"]["@_properties"]?.split(" "),
        },
      }
    }, {})

    return this.manifest
  }

  /**
   * Returns the first index in the metadata element's children array
   * that matches the provided predicate.
   *
   * Note: This may technically be different than the index in the
   * getMetadata() array, as it includes non-metadata nodes, like
   * text nodes. These are technically not allowed, but may exist,
   * nonetheless. As consumers only ever see the getMetadata()
   * array, this method is only meant to be used internally.
   */
  private findMetadataIndex(
    packageElement: PackageElement,
    predicate: (entry: MetadataEntry) => boolean,
  ) {
    const metadataElement = Epub.findXmlChildByName(
      "metadata",
      Epub.getXmlChildren(packageElement),
    )

    if (!metadataElement)
      throw new Error(
        "Failed to parse EPUB: Found no metadata element in package document",
      )

    return metadataElement.metadata.findIndex((node) => {
      const item = Epub.parseMetadataItem(node)
      if (!item) return false
      return predicate(item)
    })
  }

  /**
   * Returns the item in the metadata element's children array
   * that matches the provided predicate.
   */
  public async findMetadataItem(predicate: (entry: MetadataEntry) => boolean) {
    const [first] = await this.findAllMetadataItems(predicate)
    return first ?? null
  }

  /**
   * Returns the item in the metadata element's children array
   * that matches the provided predicate.
   */
  public async findAllMetadataItems(
    predicate: (entry: MetadataEntry) => boolean,
  ) {
    const packageElement = await this.getPackageElement()

    const metadataElement = Epub.findXmlChildByName(
      "metadata",
      Epub.getXmlChildren(packageElement),
    )

    if (!metadataElement)
      throw new Error(
        "Failed to parse EPUB: Found no metadata element in package document",
      )

    const elements = metadataElement.metadata.filter((node) => {
      const item = Epub.parseMetadataItem(node)
      if (!item) return false
      return predicate(item)
    })

    return elements
      .map((element) => Epub.parseMetadataItem(element))
      .filter((item) => !!item)
  }

  private static parseMetadataItem(node: XmlNode) {
    if (Epub.isXmlTextNode(node)) return null

    const elementName = Epub.getXmlElementName(node)
    const textNode = Epub.getXmlChildren(node)[0]

    // https://www.w3.org/TR/epub-33/#sec-metadata-values
    // Whitespace within these element values is not significant.
    // Sequences of one or more whitespace characters are collapsed
    // to a single space [infra] during processing .
    const value =
      !textNode || !Epub.isXmlTextNode(textNode)
        ? undefined
        : textNode["#text"].replaceAll(/\s+/g, " ")
    const attributes = node[":@"] ?? {}
    const { id, ...properties } = Object.fromEntries(
      Object.entries(attributes).map(([attrName, value]) => [
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
  }

  /**
   * Retrieve the metadata entries for the Epub.
   *
   * This is represented as an array of metadata entries,
   * in the order that they're presented in the Epub package document.
   *
   * For more useful semantic representations of metadata, use
   * specific methods such as `getTitle()` and `getAuthors()`.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-pkg-metadata
   */
  async getMetadata() {
    const packageElement = await this.getPackageElement()

    const metadataElement = Epub.findXmlChildByName(
      "metadata",
      Epub.getXmlChildren(packageElement),
    )

    if (!metadataElement)
      throw new Error(
        "Failed to parse EPUB: Found no metadata element in package document",
      )

    const metadata: EpubMetadata = metadataElement.metadata
      .map((node) => Epub.parseMetadataItem(node))
      .filter((node) => !!node)

    return metadata
  }

  /**
   * Retrieve the identifier from the dc:identifier element
   * in the EPUB metadata.
   *
   * If there is no dc:identifier element, returns null.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier
   */
  async getIdentifier() {
    const metadata = await this.getMetadata()
    const entry = metadata.find(({ type }) => type === "dc:identifier")
    return entry?.value ?? null
  }

  /**
   * Set the dc:identifier metadata element with the provided string.
   *
   * Updates the existing dc:identifier element if one exists.
   * Otherwise creates a new element
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier
   */
  async setIdentifier(identifier: string) {
    await this.replaceMetadata(({ type }) => type === "dc:identifier", {
      type: "dc:identifier",
      properties: {},
      value: identifier,
    })
  }

  /**
   * Even "EPUB 3" publications sometimes still only use the
   * EPUB 2 specification for identifying the cover image.
   * This is a private method that is used as a fallback if
   * we fail to find the cover image according to the EPUB 3
   * spec.
   */
  private async getEpub2CoverImage() {
    const packageElement = await this.getPackageElement()

    const metadataElement = Epub.findXmlChildByName(
      "metadata",
      Epub.getXmlChildren(packageElement),
    )

    if (!metadataElement)
      throw new Error(
        "Failed to parse EPUB: Found no metadata element in package document",
      )

    const coverImageElement = Epub.getXmlChildren(metadataElement).find(
      (node): node is XmlElement =>
        !Epub.isXmlTextNode(node) && node[":@"]?.["@_name"] === "cover",
    )

    const manifestItemId = coverImageElement?.[":@"]?.["@_content"]
    if (!manifestItemId) return null

    const manifest = await this.getManifest()
    return (
      Object.values(manifest).find((item) => item.id === manifestItemId) ?? null
    )
  }

  /**
   * Retrieve the cover image manifest item.
   *
   * This does not return the actual image data. To
   * retrieve the image data, pass this item's id to
   * epub.readItemContents, or use epub.getCoverImage()
   * instead.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-cover-image
   */
  async getCoverImageItem() {
    const manifest = await this.getManifest()
    const coverImage = Object.values(manifest).find((item) =>
      item.properties?.includes("cover-image"),
    )
    if (coverImage) return coverImage

    return this.getEpub2CoverImage()
  }

  /**
   * Retrieve the cover image data as a byte array.
   *
   * This does not include, for example, the cover image's
   * filename or mime type. To retrieve the image manifest
   * item, use epub.getCoverImageItem().
   *
   * @link https://www.w3.org/TR/epub-33/#sec-cover-image
   */
  async getCoverImage() {
    const coverImageItem = await this.getCoverImageItem()
    if (!coverImageItem) return coverImageItem

    return this.readItemContents(coverImageItem.id)
  }

  /**
   * Set the cover image for the EPUB.
   *
   * Adds a manifest item with the `cover-image` property, per
   * the EPUB 3 spec, and then writes the provided image data to
   * the provided href within the publication.
   */
  async setCoverImage(href: string, data: Uint8Array) {
    const coverImageItem = await this.getCoverImageItem()
    if (coverImageItem) {
      await this.removeManifestItem(coverImageItem.id)
    }
    const mediaType = lookup(href)
    if (!mediaType)
      throw new Error(`Invalid file extension for cover image: ${href}`)

    await this.addManifestItem(
      { id: "cover-image", href, mediaType, properties: ["cover-image"] },
      data,
    )
  }

  /**
   * Retrieve the publication date from the dc:date element
   * in the EPUB metadata as a Date object.
   *
   * If there is no dc:date element, returns null.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcdate
   */
  async getPublicationDate() {
    const metadata = await this.getMetadata()
    const entry = metadata.find(({ type }) => type === "dc:date")
    if (!entry?.value) return null
    return new Date(entry.value)
  }

  /**
   * Set the dc:date metadata element with the provided date.
   *
   * Updates the existing dc:date element if one exists.
   * Otherwise creates a new element
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcdate
   */
  async setPublicationDate(date: Date) {
    await this.replaceMetadata(({ type }) => type === "dc:date", {
      type: "dc:date",
      properties: {},
      value: date.toISOString(),
    })
  }

  /**
   * Set the dc:type metadata element.
   *
   * Updates the existing dc:type element if one exists.
   * Otherwise creates a new element.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dctype
   */
  async setType(type: string) {
    await this.replaceMetadata(({ type }) => type === "dc:type", {
      type: "dc:type",
      properties: {},
      value: type,
    })
  }

  /**
   * Retrieve the publication type from the dc:type element
   * in the EPUB metadata.
   *
   * If there is no dc:type element, returns null.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dctype
   */
  async getType() {
    const metadata = await this.getMetadata()
    return metadata.find(({ type }) => type === "dc:type") ?? null
  }

  /**
   * Add a subject to the EPUB metadata.
   *
   * @param subject May be a string representing just a schema-less
   *  subject name, or a DcSubject object
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcsubject
   */
  async addSubject(subject: string | DcSubject) {
    const subjectEntry =
      typeof subject === "string"
        ? {
            value: subject,
          }
        : subject
    const subjectId = nanoid()
    await this.addMetadata({
      id: subjectId,
      type: "dc:subject",
      properties: {},
      value: subjectEntry.value,
    })

    if ("authority" in subjectEntry) {
      await this.addMetadata({
        type: "meta",
        properties: { refines: `#${subjectId}`, property: "authority" },
        value: subjectEntry.authority,
      })
      await this.addMetadata({
        type: "meta",
        properties: { refines: `#${subjectId}`, property: "term" },
        value: subjectEntry.term,
      })
    }
  }

  /**
   * Remove a subject from the EPUB metadata.
   *
   * Removes the subject at the provided index. This index
   * refers to the array returned by `epub.getSubjects()`.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dccreator
   */
  async removeSubject(index: number) {
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      let subjectCount: null | number = null
      let metadataIndex: null | number = null
      for (const meta of Epub.getXmlChildren(metadata)) {
        if (subjectCount === index) break
        metadataIndex = metadataIndex === null ? 0 : metadataIndex + 1
        if (Epub.isXmlTextNode(meta)) continue
        if (Epub.getXmlElementName(meta) !== "dc:subject") continue
        subjectCount = subjectCount === null ? 0 : subjectCount + 1
      }

      if (subjectCount === null || metadataIndex === null) return

      Epub.getXmlChildren(metadata).splice(metadataIndex, 1)
    })
  }

  /**
   * Retrieve the list of subjects for this EPUB.
   *
   * Subjects without associated authority and term metadata
   * will be returned as strings. Otherwise, they will
   * be represented as DcSubject objects, with a value,
   * authority, and term.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcsubject
   */
  async getSubjects() {
    const metadata = await this.getMetadata()

    const subjectEntries = metadata.filter(({ type }) => type === "dc:subject")
    const subjects: Array<string | DcSubject> = subjectEntries
      .map(({ value }) => value)
      .filter((value): value is string => !!value)

    metadata.forEach((entry) => {
      if (
        entry.type !== "meta" ||
        (entry.properties["property"] !== "term" &&
          entry.properties["property"] !== "authority")
      ) {
        return
      }
      const subjectIdref = entry.properties["refines"]
      if (!subjectIdref) return

      const subjectId = subjectIdref.slice(1)
      const index = subjectEntries.findIndex((entry) => entry.id === subjectId)
      if (index === -1) return

      const subject =
        typeof subjects[index] === "string"
          ? { value: subjects[index], authority: undefined, term: undefined }
          : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            subjects[index]!

      subject[entry.properties["property"]] = entry.value
      subjects.splice(index, 1, subject as DcSubject)
    })

    return subjects
  }

  /**
   * Retrieve the Epub's language as specified in its
   * package document metadata.
   *
   * If no language metadata is specified, returns null.
   * Returns the language as an Intl.Locale instance.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dclanguage
   */
  async getLanguage() {
    const metadata = await this.getMetadata()
    const languageEntries = metadata.filter(
      (entry) => entry.type === "dc:language",
    )
    const primaryLanguage = languageEntries[0]
    if (!primaryLanguage) return null

    const locale = primaryLanguage.value
    // Handle a weird edge case where Calibre's metadata
    // GUI incorrectly sets the language code to 'und'/'UND'
    // https://www.mobileread.com/forums/showthread.php?t=87928
    if (!locale || locale.toLowerCase() === "und") return null

    return new Intl.Locale(locale)
  }

  /**
   * Update the Epub's language metadata entry.
   *
   * Updates the existing dc:language element if one exists.
   * Otherwise creates a new element
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dclanguage
   */
  async setLanguage(locale: Intl.Locale) {
    await this.replaceMetadata(({ type }) => type === "dc:language", {
      type: "dc:language",
      properties: {},
      value: locale.toString(),
    })
  }

  /**
   * Retrieve the title of the Epub.
   *
   * @param main Optional - whether to return only the first title segment
   *  if multiple are found. Otherwise, will follow the spec to combine title
   *  segments
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dctitle
   */
  async getTitle(expanded = false) {
    const entries = await this.getTitles()

    if (!expanded) {
      const mainEntry = entries.find((entry) => entry.type === "main")
      if (mainEntry) return mainEntry.title

      const shortEntry = entries.find((entry) => entry.type === "short")
      if (shortEntry) return shortEntry.title

      return entries[0]?.title ?? null
    }

    const expandedEntry = entries.find((entry) => entry.type === "expanded")
    if (expandedEntry) return expandedEntry.title

    return entries.map((entry) => entry.title).join(", ")
  }

  /**
   * Retrieve the subtitle of the Epub, if it exists.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dctitle
   */
  async getSubtitle() {
    const entries = await this.getTitles()

    const subtitleEntry = entries.find((entry) => entry.type === "subtitle")
    return subtitleEntry?.title ?? null
  }

  /**
   * Retrieve all title entries of the Epub.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dctitle
   */
  async getTitles() {
    const metadata = await this.getMetadata()
    const titleEntries = metadata.filter((entry) => entry.type === "dc:title")

    const titleRefinements = metadata.filter(
      (entry) =>
        entry.type === "meta" &&
        entry.properties["refines"] &&
        (entry.properties["property"] === "title-type" ||
          entry.properties["property"] === "display-seq"),
    )

    const sortedTitleParts = titleEntries
      .filter(
        (titleEntry) =>
          titleEntry.id &&
          titleRefinements.some(
            (entry) =>
              entry.value &&
              entry.properties["refines"]?.slice(1) === titleEntry.id &&
              entry.properties["property"] === "display-seq" &&
              !Number.isNaN(parseInt(entry.value, 10)),
          ),
      )
      .sort((a, b) => {
        /* eslint-disable @typescript-eslint/no-non-null-assertion */
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
        /* eslint-enable @typescript-eslint/no-non-null-assertion */
        return sortA - sortB
      })

    return (
      sortedTitleParts.length === 0 ? titleEntries : sortedTitleParts
    ).map((entry) => {
      const titleType = titleRefinements.find(
        (refinement) =>
          refinement.properties["refines"]?.slice(1) === entry.id &&
          refinement.properties["property"] === "title-type",
      )
      return {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        title: entry.value!,
        type: titleType?.value ?? null,
      }
    })
  }

  /**
   * Update the Epub's description metadata entry.
   *
   * Updates the existing dc:description element if one exists.
   * Otherwise creates a new element. Any non-ASCII symbols,
   * `&`, `<`, `>`, `"`, `'`, and `\``` will be encoded as HTML entities.
   */
  async setDescription(description: string) {
    await this.replaceMetadata(({ type }) => type === "dc:description", {
      type: "dc:description",
      value: description,
      properties: {},
    })
  }

  /**
   * Retrieve the Epub's description as specified in its
   * package document metadata.
   *
   * If no description metadata is specified, returns null.
   * Returns the description as a string. Descriptions may
   * include HTML markup.
   */
  async getDescription() {
    const metadata = await this.getMetadata()
    const descriptionEntry = metadata.find(
      (entry) => entry.type === "dc:description",
    )
    if (!descriptionEntry?.value) return null
    return descriptionEntry.value
  }

  /**
   * Return the set of custom vocabulary prefixes set on this publication's
   * root package element.
   *
   * Returns a map from prefix to URI
   *
   * @link https://www.w3.org/TR/epub-33/#sec-prefix-attr
   */
  async getPackageVocabularyPrefixes() {
    const packageElement = await this.getPackageElement()
    const prefixValue = packageElement[":@"]?.["@_prefix"]
    if (!prefixValue) return {}

    const matches = prefixValue.matchAll(/(?:([a-z]+): +(\S+)\s*)/gs)
    return Array.from(matches).reduce<Record<string, string>>(
      (acc, match) =>
        match[1] && match[2] ? { ...acc, [match[1]]: match[2] } : acc,
      {},
    )
  }

  /**
   * Set a custom vocabulary prefix on the root package element.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-prefix-attr
   */
  async setPackageVocabularyPrefix(prefix: string, uri: string) {
    await this.withPackage(async (packageElement) => {
      const prefixes = await this.getPackageVocabularyPrefixes()
      prefixes[prefix] = uri

      packageElement[":@"] ??= {}
      packageElement[":@"]["@_prefix"] = Object.entries(prefixes)
        .map(([p, u]) => `${p}: ${u}`)
        .join("\n    ")
    })
  }

  /**
   * Set the title of the Epub.
   *
   * This will replace all existing dc:title elements with
   * this title. It will be given title-type "main".
   *
   * To set specific titles and their types, use epub.setTitles().
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dctitle
   */
  // TODO: This should allow users to optionally specify an array,
  // rather than a single string, to support expanded titles.
  async setTitle(title: string) {
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      const titleElement = Epub.findXmlChildByName(
        "dc:title",
        metadata.metadata,
      )

      if (!titleElement) {
        Epub.getXmlChildren(metadata).push(
          Epub.createXmlElement("dc:title", {}, [
            Epub.createXmlTextNode(title),
          ]),
        )
      } else {
        titleElement["dc:title"] = [Epub.createXmlTextNode(title)]
      }
    })
  }

  async setTitles(entries: { title: string; type: string | null }[]) {
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )

      if (!metadata) {
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )
      }

      const metadataEntries = Epub.getXmlChildren(metadata)
      for (let i = metadataEntries.length - 1; i >= 0; i--) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const meta = metadataEntries[i]!
        if (Epub.isXmlTextNode(meta)) continue
        if (
          Epub.getXmlElementName(meta) === "dc:title" ||
          meta[":@"]?.["@_property"] === "title-type" ||
          meta[":@"]?.["@_property"] === "display-seq"
        ) {
          metadataEntries.splice(i, 1)
        }
      }

      for (let i = 0; i < entries.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const entry = entries[i]!
        const id = nanoid()

        metadataEntries.push(
          Epub.createXmlElement("dc:title", { id }, [
            Epub.createXmlTextNode(entry.title),
          ]),
        )

        if (entry.type) {
          metadataEntries.push(
            Epub.createXmlElement(
              "meta",
              { refines: `#${id}`, property: "title-type" },
              [Epub.createXmlTextNode(entry.type)],
            ),
          )
        }

        metadataEntries.push(
          Epub.createXmlElement(
            "meta",
            { refines: `#${id}`, property: "display-seq" },
            [Epub.createXmlTextNode((i + 1).toString())],
          ),
        )
      }
    })
  }

  /**
   * Retrieve the list of collections.
   */
  async getCollections() {
    const metadata = await this.getMetadata()

    const collections: Collection[] = []

    for (const entry of metadata) {
      if (
        entry.properties["property"] === "belongs-to-collection" &&
        entry.value
      ) {
        const type = metadata.find(
          (e) =>
            e.properties["refines"] === `#${entry.id ?? ""}` &&
            e.properties["property"] === "collection-type",
        )?.value

        const position = metadata.find(
          (e) =>
            e.properties["refines"] === `#${entry.id ?? ""}` &&
            e.properties["property"] === "group-position",
        )?.value

        collections.push({
          name: entry.value,
          ...(type && { type }),
          ...(position && { position }),
        })
      }
    }

    return collections
  }

  /**
   * Add a collection to the EPUB metadata.
   *
   * If index is provided, the collection will be placed at
   * that index in the list of collections. Otherwise, it
   * will be added to the end of the list.
   */
  async addCollection(collection: Collection, index?: number) {
    const collectionId = nanoid()

    // Order matters for creators and contributors,
    // so we can't just append these to the end of the
    // metadata element's children using `addMetadata`.
    // We have to manually find the correct insertion point
    // based on the provided index
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      let collectionCount = 0
      let metadataIndex = 0
      for (const meta of Epub.getXmlChildren(metadata)) {
        if (collectionCount === index) break
        metadataIndex++
        if (Epub.isXmlTextNode(meta)) continue
        if (Epub.getXmlElementName(meta) !== "meta") continue
        if (meta[":@"]?.["@_property"] !== "belongs-to-collection") continue
        collectionCount++
      }

      Epub.getXmlChildren(metadata).splice(
        metadataIndex,
        0,
        Epub.createXmlElement(
          "meta",
          { id: collectionId, property: "belongs-to-collection" },
          [Epub.createXmlTextNode(collection.name)],
        ),
      )
    })

    // These can all just go at the end; order is only
    // important for the `dc:creator`/`dc:contributor`
    // elements
    if (collection.position) {
      await this.addMetadata({
        type: "meta",
        properties: { refines: `#${collectionId}`, property: "group-position" },
        value: collection.position,
      })
    }

    if (collection.type) {
      await this.addMetadata({
        type: "meta",
        properties: {
          refines: `#${collectionId}`,
          property: "collection-type",
        },
        value: collection.type,
      })
    }
  }

  /**
   * Remove a collection from the EPUB metadata.
   *
   * Removes the collection at the provided index. This index
   * refers to the array returned by `epub.getCollections()`.
   */
  async removeCollection(index: number) {
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      let collectionCount: number | null = null
      let metadataIndex: number | null = null
      for (const meta of Epub.getXmlChildren(metadata)) {
        if (collectionCount === index) break
        metadataIndex = metadataIndex === null ? 0 : metadataIndex + 1
        if (Epub.isXmlTextNode(meta)) continue
        if (Epub.getXmlElementName(meta) !== "meta") continue
        if (meta[":@"]?.["@_property"] !== "belongs-to-collection") continue
        collectionCount = collectionCount === null ? 0 : collectionCount + 1
      }

      if (collectionCount === null || metadataIndex === null) return

      const [removed] = Epub.getXmlChildren(metadata).splice(metadataIndex, 1)

      if (removed && !Epub.isXmlTextNode(removed) && removed[":@"]?.["@_id"]) {
        const id = removed[":@"]["@_id"]
        const newChildren = Epub.getXmlChildren(metadata).filter((node) => {
          if (Epub.isXmlTextNode(node)) return true
          if (Epub.getXmlElementName(node) !== "meta") return true
          if (node[":@"]?.["@_refines"] !== `#${id}`) return true
          return false
        })
        Epub.replaceXmlChildren(metadata, newChildren)
      }
    })
  }

  /**
   * Retrieve the list of creators.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dccreator
   */
  async getCreators(type: "creator" | "contributor" = "creator") {
    const metadata = await this.getMetadata()

    const creatorEntries = metadata.filter(
      (entry) => entry.type === `dc:${type}`,
    )
    const creators: Array<DcCreator> = creatorEntries
      .map(({ value }) => value)
      .filter((value): value is string => !!value)
      .map((value) => ({ name: value }))

    metadata.forEach((entry) => {
      if (
        entry.type !== "meta" ||
        (entry.properties["property"] !== "file-as" &&
          entry.properties["property"] !== "role" &&
          entry.properties["property"] !== "alternate-script") ||
        !entry.value
      ) {
        return
      }
      const creatorIdref = entry.properties["refines"]
      if (!creatorIdref) return

      const creatorId = creatorIdref.slice(1)
      const index = creatorEntries.findIndex((entry) => entry.id === creatorId)
      if (index === -1) return

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const creator = creators[index]!

      if (entry.properties["alternate-script"]) {
        if (!entry.properties["xml:lang"]) return
        creator.alternateScripts ??= []
        creator.alternateScripts.push({
          name: entry.value,
          locale: new Intl.Locale(entry.properties["xml:lang"]),
        })
        return
      }

      const prop =
        entry.properties["property"] === "file-as" ? "fileAs" : "role"

      creator[prop] = entry.value
      if (prop === "role" && entry.properties["scheme"]) {
        creator.roleScheme = entry.properties["scheme"]
      }
    })

    return creators
  }

  /**
   * Retrieve the list of contributors.
   *
   * This is a convenience method for
   * `epub.getCreators('contributor')`.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dccontributor
   */
  getContributors() {
    return this.getCreators("contributor")
  }

  /**
   * Add a creator to the EPUB metadata.
   *
   * If index is provided, the creator will be placed at
   * that index in the list of creators. Otherwise, it
   * will be added to the end of the list.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dccreator
   */
  async addCreator(
    creator: DcCreator,
    index?: number,
    type: "creator" | "contributor" = "creator",
  ) {
    const creatorId = nanoid()

    // Order matters for creators and contributors,
    // so we can't just append these to the end of the
    // metadata element's children using `addMetadata`.
    // We have to manually find the correct insertion point
    // based on the provided index
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      let creatorCount = 0
      let metadataIndex = 0
      for (const meta of Epub.getXmlChildren(metadata)) {
        if (creatorCount === index) break
        metadataIndex++
        if (Epub.isXmlTextNode(meta)) continue
        if (Epub.getXmlElementName(meta) !== `dc:${type}`) continue
        creatorCount++
      }

      Epub.getXmlChildren(metadata).splice(
        metadataIndex,
        0,
        Epub.createXmlElement(`dc:${type}`, { id: creatorId }, [
          Epub.createXmlTextNode(creator.name),
        ]),
      )
    })

    // These can all just go at the end; order is only
    // important for the `dc:creator`/`dc:contributor`
    // elements
    if (creator.role) {
      await this.addMetadata({
        type: "meta",
        properties: {
          refines: `#${creatorId}`,
          property: "role",
          ...(creator.roleScheme && { scheme: creator.roleScheme }),
        },
        value: creator.role,
      })
    }

    if (creator.fileAs) {
      await this.addMetadata({
        type: "meta",
        properties: { refines: `#${creatorId}`, property: "file-as" },
        value: creator.fileAs,
      })
    }

    if (creator.alternateScripts) {
      for (const alternate of creator.alternateScripts) {
        await this.addMetadata({
          type: "meta",
          properties: {
            refines: `#${creatorId}`,
            property: "alternate-script",
            "xml:lang": alternate.locale.toString(),
          },
          value: alternate.name,
        })
      }
    }
  }

  /**
   * Remove a creator from the EPUB metadata.
   *
   * Removes the creator at the provided index. This index
   * refers to the array returned by `epub.getCreators()`.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dccreator
   */
  async removeCreator(
    index: number,
    type: "creator" | "contributor" = "creator",
  ) {
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      let creatorCount: null | number = null
      let metadataIndex: null | number = null
      for (const meta of Epub.getXmlChildren(metadata)) {
        if (creatorCount === index) break
        metadataIndex = metadataIndex === null ? 0 : metadataIndex + 1
        if (Epub.isXmlTextNode(meta)) continue
        if (Epub.getXmlElementName(meta) !== `dc:${type}`) continue
        creatorCount = creatorCount === null ? 0 : creatorCount + 1
      }

      if (creatorCount === null || metadataIndex === null) return

      const [removed] = Epub.getXmlChildren(metadata).splice(metadataIndex, 1)

      if (removed && !Epub.isXmlTextNode(removed) && removed[":@"]?.["@_id"]) {
        const id = removed[":@"]["@_id"]
        const newChildren = Epub.getXmlChildren(metadata).filter((node) => {
          if (Epub.isXmlTextNode(node)) return true
          if (Epub.getXmlElementName(node) !== "meta") return true
          if (node[":@"]?.["@_refines"] !== `#${id}`) return true
          return false
        })
        Epub.replaceXmlChildren(metadata, newChildren)
      }
    })
  }

  /**
   * Remove a contributor from the EPUB metadata.
   *
   * Removes the contributor at the provided index. This index
   * refers to the array returned by `epub.getContributors()`.
   *
   * This is a convenience method for
   * `epub.removeCreator(index, 'contributor')`.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dccreator
   */
  async removeContributor(index: number) {
    return this.removeCreator(index, "contributor")
  }

  /**
   * Add a contributor to the EPUB metadata.
   *
   * If index is provided, the creator will be placed at
   * that index in the list of creators. Otherwise, it
   * will be added to the end of the list.
   *
   * This is a convenience method for
   * `epub.addCreator(contributor, index, 'contributor')`.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dccreator
   */
  addContributor(contributor: DcCreator, index?: number) {
    return this.addCreator(contributor, index, "contributor")
  }

  private async getSpine() {
    if (this.spine !== null) return this.spine

    const packageElement = await this.getPackageElement()

    const spine = Epub.findXmlChildByName(
      "spine",
      Epub.getXmlChildren(packageElement),
    )

    if (!spine)
      throw new Error(
        "Failed to parse EPUB: Found no spine element in package document",
      )

    this.spine = spine["spine"]
      .filter((node): node is XmlElement => !Epub.isXmlTextNode(node))
      .map((itemref) => itemref[":@"]?.["@_idref"])
      .filter((idref): idref is string => !!idref)

    return this.spine
  }

  /**
   * Retrieve the manifest items that make up the Epub's spine.
   *
   * The spine specifies the order that the contents of the Epub
   * should be displayed to users by default.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-spine-elem
   */
  async getSpineItems() {
    const spine = await this.getSpine()
    const manifest = await this.getManifest()

    return spine.map((itemref) => manifest[itemref]).filter((entry) => !!entry)
  }

  /**
   * Add an item to the spine of the EPUB.
   *
   * If `index` is undefined, the item will be added
   * to the end of the spine. Otherwise it will be
   * inserted at the specified index.
   *
   * If the manifestId does not correspond to an item
   * in the manifest, this will throw an error.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-spine-elem
   */
  async addSpineItem(manifestId: string, index?: number) {
    const item = Epub.createXmlElement("itemref", { idref: manifestId })

    const manifest = await this.getManifest()
    const manifestItem = manifest[manifestId]

    if (!manifestItem)
      throw new Error(`Manifest item not found with id "${manifestId}"`)

    await this.withPackage((packageElement) => {
      const spine = Epub.findXmlChildByName(
        "spine",
        Epub.getXmlChildren(packageElement),
      )

      if (!spine)
        throw new Error(
          "Failed to parse EPUB: Found no spine element in package document",
        )

      if (index === undefined) {
        Epub.getXmlChildren(spine).push(item)
      } else {
        Epub.getXmlChildren(spine).splice(index, 0, item)
      }
    })

    // Reset the spine cache
    this.spine = null
  }

  /**
   * Remove the spine item at the specified index.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-spine-elem
   */
  async removeSpineItem(index: number) {
    await this.withPackage((packageElement) => {
      const spine = Epub.findXmlChildByName(
        "spine",
        Epub.getXmlChildren(packageElement),
      )

      if (!spine)
        throw new Error(
          "Failed to parse EPUB: Found no spine element in package document",
        )

      Epub.getXmlChildren(spine).splice(index, 1)
    })

    // Reset the spine cache
    this.spine = null
  }

  /**
   * Returns a Zip Entry path for an HREF
   */
  private resolveHref(from: PortablePath, href: string) {
    const startPath = ppath.dirname(from)
    return ppath.resolve(PortablePath.root, startPath, href)
  }

  /**
   * Retrieve the contents of a manifest item, given its id.
   *
   * @param id The id of the manifest item to retrieve
   * @param [encoding] Optional - must be the string "utf-8". If
   *  provided, the function will encode the data into a unicode string.
   *  Otherwise, the data will be returned as a byte array.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-contentdocs
   */
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

  /**
   * Create a new XHTML document with the given body
   * and head.
   *
   * @param body The XML nodes to place in the body of the document
   * @param head Optional - the XMl nodes to place in the head
   * @param language Optional - defaults to the EPUB's language
   */
  async createXhtmlDocument(
    body: ParsedXml,
    head?: ParsedXml,
    language?: Intl.Locale,
  ) {
    const lang = language ?? (await this.getLanguage())

    return [
      Epub.createXmlElement("?xml", { version: "1.0", encoding: "UTF-8" }),
      Epub.createXmlElement(
        "html",
        {
          xmlns: "http://www.w3.org/1999/xhtml",
          "xmlns:epub": "http://www.idpf.org/2007/ops",
          ...(lang && { "xml:lang": lang.toString(), lang: lang.toString() }),
        },
        [
          Epub.createXmlElement("head", {}, head),
          Epub.createXmlElement("body", {}, body),
        ],
      ),
    ]
  }

  /**
   * Retrieves the contents of an XHTML item, given its manifest id.
   *
   * @param id The id of the manifest item to retrieve
   * @param [as] Optional - whether to return the parsed XML document tree,
   *  or the concatenated text of the document. Defaults to the parsed XML tree.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-xhtml
   */
  async readXhtmlItemContents(id: string, as?: "xhtml"): Promise<ParsedXml>
  async readXhtmlItemContents(id: string, as: "text"): Promise<string>
  async readXhtmlItemContents(
    id: string,
    as: "xhtml" | "text" = "xhtml",
  ): Promise<ParsedXml | string> {
    const contents = await this.readItemContents(id, "utf-8")
    const xml = Epub.xhtmlParser.parse(contents) as ParsedXml
    if (as === "xhtml") return xml

    const body = Epub.getXhtmlBody(xml)
    return Epub.getXhtmlTextContent(body)
  }

  private async writeEntryContents(
    path: PortablePath,
    contents: Uint8Array,
  ): Promise<void>
  private async writeEntryContents(
    path: PortablePath,
    contents: string,
    encoding: "utf-8",
  ): Promise<void>
  private async writeEntryContents(
    path: PortablePath,
    contents: Uint8Array | string,
    encoding?: "utf-8",
  ): Promise<void> {
    await this.zipFs.mkdirpPromise(ppath.dirname(path))
    await this.zipFs.writeFilePromise(path, contents, encoding)
  }

  /**
   * Write new contents for an existing manifest item,
   * specified by its id.
   *
   * The id must reference an existing manifest item. If
   * creating a new item, use `epub.addManifestItem()` instead.
   *
   * @param id The id of the manifest item to write new contents for
   * @param contents The new contents. May be either a utf-8 encoded string
   *  or a byte array, as determined by the encoding
   * @param [encoding] Optional - must be the string "utf-8". If provided,
   *  the contents will be interpreted as a unicode string. Otherwise, the
   *  contents must be a byte array.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-contentdocs
   */
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
    memoize.clear(this.readXhtmlItemContents)
    const href = this.resolveHref(rootfile, manifestItem.href)
    if (encoding === "utf-8") {
      await this.writeEntryContents(href, contents as string, encoding)
    } else {
      await this.writeEntryContents(href, contents as Uint8Array)
    }
  }

  /**
   * Write new contents for an existing XHTML item,
   * specified by its id.
   *
   * The id must reference an existing manifest item. If
   * creating a new item, use `epub.addManifestItem()` instead.
   *
   * @param id The id of the manifest item to write new contents for
   * @param contents The new contents. Must be a parsed XML tree.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-xhtml
   */
  async writeXhtmlItemContents(id: string, contents: ParsedXml): Promise<void> {
    await this.writeItemContents(
      id,
      Epub.xhtmlBuilder.build(contents) as string,
      "utf-8",
    )
  }

  async removeManifestItem(id: string) {
    await this.withPackage(async (packageElement) => {
      const manifest = Epub.findXmlChildByName(
        "manifest",
        Epub.getXmlChildren(packageElement),
      )

      if (!manifest)
        throw new Error(
          "Failed to parse EPUB: Found no manifest element in package document",
        )

      const itemIndex = Epub.getXmlChildren(manifest).findIndex(
        (node) => !Epub.isXmlTextNode(node) && node[":@"]?.["@_id"] === id,
      )

      if (itemIndex === -1) return

      const [item] = Epub.getXmlChildren(manifest).splice(itemIndex, 1)

      if (!item || Epub.isXmlTextNode(item) || !item[":@"]?.["@_href"]) return

      await this.removeEntry(item[":@"]["@_href"])
    })

    // Reset the cached manifest, so that it will be read from
    // the updated XML next time
    this.manifest = null
  }

  /**
   * Create a new manifest item and write its contents to a
   * new entry.
   *
   * @param id The id of the manifest item to write new contents for
   * @param contents The new contents. May be either a parsed XML tree
   *  or a unicode string, as determined by the `as` argument.
   * @param encoding Optional - whether to interpret contents as a parsed
   *  XML tree, a unicode string, or a byte array. Defaults to a byte array.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-pkg-manifest
   * @link https://www.w3.org/TR/epub-33/#sec-contentdocs
   */
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
    await this.withPackage((packageElement) => {
      const manifest = Epub.findXmlChildByName(
        "manifest",
        Epub.getXmlChildren(packageElement),
      )

      if (!manifest)
        throw new Error(
          "Failed to parse EPUB: Found no manifest element in package document",
        )

      // TODO: Should we ensure that there isn't already a manifest
      // item with this id first?
      Epub.getXmlChildren(manifest).push(
        Epub.createXmlElement("item", {
          id: item.id,
          href: item.href,
          ...(item.mediaType && { "media-type": item.mediaType }),
          ...(item.fallback && { fallback: item.fallback }),
          ...(item.mediaOverlay && { "media-overlay": item.mediaOverlay }),
          ...(item.properties && {
            properties: item.properties.join(" "),
          }),
        }),
      )
    })
    // Reset the cached manifest, so that it will be read from
    // the updated XML next time
    this.manifest = null

    const rootfile = await this.getRootfile()

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

    await this.zipFs.mkdirpPromise(ppath.dirname(filename))
    await this.zipFs.writeFilePromise(filename, data)
  }

  /**
   * Update the manifest entry for an existing item.
   *
   * To update the contents of an entry, use `epub.writeItemContents()`
   * or `epub.writeXhtmlItemContents()`
   *
   * @link https://www.w3.org/TR/epub-33/#sec-pkg-manifest
   */
  async updateManifestItem(id: string, newItem: Omit<ManifestItem, "id">) {
    await this.withPackage((packageElement) => {
      const manifest = Epub.findXmlChildByName(
        "manifest",
        Epub.getXmlChildren(packageElement),
      )

      if (!manifest)
        throw new Error(
          "Failed to parse EPUB: Found no manifest element in package document",
        )

      const itemIndex = manifest["manifest"].findIndex(
        (item) => !Epub.isXmlTextNode(item) && item[":@"]?.["@_id"] === id,
      )

      Epub.getXmlChildren(manifest).splice(
        itemIndex,
        1,
        Epub.createXmlElement("item", {
          id: id,
          href: newItem.href,
          ...(newItem.mediaType && { "media-type": newItem.mediaType }),
          ...(newItem.fallback && { fallback: newItem.fallback }),
          ...(newItem.mediaOverlay && {
            "media-overlay": newItem.mediaOverlay,
          }),
          ...(newItem.properties && {
            properties: newItem.properties.join(" "),
          }),
        }),
      )
    })

    // Reset the cached manifest, so that it will be read from
    // the updated XML next time
    this.manifest = null
  }

  /**
   * Add a new metadata entry to the Epub.
   *
   * This method, like `epub.getMetadata()`, operates on
   * metadata entries. For more useful semantic representations
   * of metadata, use specific methods such as `setTitle()` and
   * `setLanguage()`.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-pkg-metadata
   */
  async addMetadata(entry: MetadataEntry) {
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      Epub.getXmlChildren(metadata).push(
        Epub.createXmlElement(
          entry.type,
          {
            ...(entry.id && { id: entry.id }),
            ...entry.properties,
          },
          entry.value !== undefined
            ? [Epub.createXmlTextNode(entry.value)]
            : [],
        ),
      )
    })
  }

  /**
   * Replace a metadata entry with a new one.
   *
   * The `predicate` argument will be used to determine which entry
   * to replace. The first metadata entry that matches the
   * predicate will be replaced.
   *
   * @param predicate Calls predicate once for each metadata entry,
   *  until it finds one where predicate returns true
   * @param entry The new entry to replace the found entry with
   *
   * @link https://www.w3.org/TR/epub-33/#sec-pkg-metadata
   */
  async replaceMetadata(
    predicate: (entry: MetadataEntry) => boolean,
    entry: MetadataEntry,
  ) {
    await this.withPackage((packageElement) => {
      const metadataElement = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadataElement)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      const oldEntryIndex = this.findMetadataIndex(packageElement, predicate)

      const newElement = Epub.createXmlElement(
        entry.type,
        {
          ...(entry.id && { id: entry.id }),
          ...entry.properties,
        },
        entry.value !== undefined ? [Epub.createXmlTextNode(entry.value)] : [],
      )

      if (oldEntryIndex === -1) {
        metadataElement.metadata.push(newElement)
      } else {
        metadataElement.metadata.splice(oldEntryIndex, 1, newElement)
      }
    })
  }

  /**
   * Remove one or more metadata entries.
   *
   * The `predicate` argument will be used to determine which entries
   * to remove. The all metadata entries that match the
   * predicate will be removed.
   *
   * @param predicate Calls predicate once for each metadata entry,
   *  removing any for which it returns true
   *
   * @link https://www.w3.org/TR/epub-33/#sec-pkg-metadata
   */
  async removeMetadata(predicate: (entry: MetadataEntry) => boolean) {
    await this.withPackage((packageElement) => {
      const metadataElement = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadataElement) {
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )
      }

      const metadataEntries = Epub.getXmlChildren(metadataElement)
      for (let i = metadataEntries.length - 1; i >= 0; i--) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const meta = metadataEntries[i]!
        const item = Epub.parseMetadataItem(meta)
        if (!item) continue
        if (predicate(item)) {
          metadataEntries.splice(i, 1)
        }
      }
    })
  }

  discardAndClose() {
    this.zipFs.discardAndClose()
    this.rootfile = null
    this.manifest = null
    this.spine = null

    rmSync(this.zipPath, { recursive: true, force: true })
  }

  /**
   * Write the current contents of the Epub to a new
   * EPUB archive on disk.
   *
   * When this method is called, the "dcterms:modified"
   * meta tag is automatically updated to the current UTC
   * timestamp.
   */
  async saveAndClose() {
    if (!this.inputPath) {
      throw new Error("In-memory EPUB files cannot be saved to disk")
    }
    await this.replaceMetadata(
      (entry) => entry.properties["property"] === "dcterms:modified",
      {
        type: "meta",
        properties: { property: "dcterms:modified" },
        // We need UTC with integer seconds, but toISOString gives UTC with ms
        value: new Date().toISOString().replace(/\.\d+/, ""),
      },
    )

    // Ensure that there's a valid mimetype
    // file
    // @ts-expect-error There isn't an API for setting a specific
    // compression level for a specific file, so we just set
    // it globally before writing the mimetype file, which needs
    // to be saved without compression
    this.zipFs.level = 0
    await this.zipFs.writeFilePromise(
      ppath.join(PortablePath.root, "mimetype"),
      "application/epub+zip",
      "utf-8",
    )
    // @ts-expect-error Set the compression level back to the
    // default after writing the mimetype file
    this.zipFs.level = DEFAULT_COMPRESSION_LEVEL

    this.zipFs.saveAndClose()
    await cp(this.zipPath, this.inputPath, { force: true })
  }

  [Symbol.dispose]() {
    // @ts-expect-error internal property
    if (this.zipFs.ready) {
      this.discardAndClose()
    }
  }
}
