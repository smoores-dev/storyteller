import { Mutex } from "async-mutex"
import XMLBuilder from "fast-xml-builder"
import { XMLParser } from "fast-xml-parser"
import memoize from "mem"
import { nanoid } from "nanoid"

import { MediaType } from "@storyteller-platform/media-types"

import { copyFile } from "#files"
import { TmpFsAdapter } from "#tmpfs"

import type {
  AdapterOptions,
  ArchiveSource,
  EpubStorageAdapter,
  EpubStorageAdapterClass,
  EpubStorageKind,
} from "./adapters/interface.ts"
import * as Upgrade from "./upgrade.ts"

export { TmpFsAdapter } from "#tmpfs"
export type {
  AdapterOptions,
  ArchiveSource,
  EpubListEntry,
  EpubStorageAdapter,
  EpubStorageAdapterClass,
  EpubStorageCapabilities,
  EpubStorageKind,
} from "./adapters/interface.ts"
export { MemoryAdapter, type MemoryAdapterOptions } from "./adapters/memory.ts"

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
      textInfo?: { direction: "rtl" | "ltr" }
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
  title?: string | undefined
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

export interface EpubIdentifier {
  value: string
  id?: string | undefined
  /** the value of a refining `identifier-type` meta, if present */
  identifierType?: string | undefined
  /** the `scheme` of a refining `identifier-type` meta, or a legacy `opf:scheme` attribute */
  scheme?: string | undefined
}

export interface EpubSource {
  value: string
  id?: string | undefined
  /** the value of a refining `identifier-type` meta, if present */
  identifierType?: string | undefined
  /** the `scheme` of a refining `identifier-type` meta, or a legacy `opf:scheme` attribute */
  scheme?: string | undefined
  /**
   * whether this source has a `source-of="pagination"` refinement
   * or of a `<meta property="pageBreakSource">` element
   *
   * as of EPUB 3.4 `source-of` is advised-deprecated in favour of the
   * publication-level `pageBreakSource` property. if you want to
   * be sure to get the source of pagination, use {@link Epub.getPageBreakSource}
   */
  isPageBreakSource?: boolean | undefined
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

export interface NavigationItem {
  title: string
  href?: string
  role?: string
  children?: NavigationList
}

export type NavigationList = NavigationItem[]

export interface Navigation {
  title?: string
  role: string
  children: NavigationList
}

export interface GuideItem {
  href: string
  title: string
  type: string
}

export type PackageElement = XmlElement<"package">

export interface FromOptions {
  /**
   * when true, mutation methods throw {@link EpubReadOnlyError} at runtime
   * @default false
   */
  readonly?: boolean
}

/**
 * Read-only view of an EPUB
 * Returned by Epub.using(MemoryAdapter).from(...) and by Epub.from(path, { readonly: true })
 */
export type EpubReader = Pick<
  Epub,
  | "storage"
  | "findMetadataItem"
  | "findAllMetadataItems"
  | "resolveHref"
  | "readFileContents"
  | "readItemContents"
  | "readXhtmlItemContents"
  | "discardAndClose"
  | Extract<keyof Epub, `get${string}`>
> &
  Disposable

/**
 * Readonly Epub-instance backed by an in-memory zip handle
 * Returned by `Epub.using(MemoryAdapter).from(...)`
 */
export type InMemoryEpubReader = EpubReader & { readonly storage: "in-memory" }

export class EpubVersionError extends Error {}
export class EpubReadOnlyError extends Error {}

const OPF_NAMESPACE = "http://www.idpf.org/2007/opf"

/**
 * makes it easy to distinguish normal hrefs from external/invalid ones
 */
const ENTRY_ORIGIN = "epub:///"

/**
 * Needs to be convoluted like this, bc
 * - `encodeURIComponent` escapes `/` and `\`
 * - `encodeURI` does not escape `#` and `?`
 */
function entryToUrlPath(entry: string) {
  return entry.split("/").map(encodeURIComponent).join("/")
}

function resolveEntryUrl(from: string, href: string): URL | null {
  const base = new URL(entryToUrlPath(from), ENTRY_ORIGIN)

  if (!URL.canParse(href, base.toString())) return null

  const url = new URL(href, base)

  return url.href.startsWith(ENTRY_ORIGIN) ? url : null
}

function renameOpfAttributes(
  attrs: Record<string, string>,
  prefix: string,
): Record<string, string> {
  const attrPrefix = `@_${prefix}:`
  const renamed: Record<string, string> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (key === `@_xmlns:${prefix}`) continue
    if (key.startsWith(attrPrefix)) {
      renamed[`@_opf:${key.slice(attrPrefix.length)}`] = value
    } else {
      renamed[key] = value
    }
  }
  return renamed
}

function stripOpfPrefix(node: XmlNode, prefix: string): XmlNode {
  if (Epub.isXmlTextNode(node)) return node

  const name = Epub.getXmlElementName(node)
  const bareName = name.startsWith(`${prefix}:`)
    ? name.slice(prefix.length + 1)
    : name

  const element = {
    [bareName]: Epub.getXmlChildren(node).map((child) =>
      stripOpfPrefix(child, prefix),
    ),
  } as XmlElement
  if (node[":@"]) {
    element[":@"] = renameOpfAttributes(node[":@"], prefix)
  }
  return element
}

function normalizeOpfNamespacePrefixes(doc: ParsedXml): ParsedXml {
  const root = doc.find(
    (node): node is XmlElement =>
      !Epub.isXmlTextNode(node) &&
      Epub.getXmlElementName(node).endsWith(":package"),
  )
  if (!root) return doc

  const prefix = Epub.getXmlElementName(root).slice(0, -":package".length)
  if (root[":@"]?.[`@_xmlns:${prefix}`] !== OPF_NAMESPACE) return doc

  const stripped = stripOpfPrefix(root, prefix) as XmlElement
  stripped[":@"] = {
    ...stripped[":@"],
    "@_xmlns": OPF_NAMESPACE,
    "@_xmlns:opf": OPF_NAMESPACE,
  }

  doc[doc.indexOf(root)] = stripped
  return doc
}

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

  static xhtmlParser = (() => {
    const parser = new XMLParser({
      allowBooleanAttributes: true,
      alwaysCreateTextNode: true,
      preserveOrder: true,
      ignoreAttributes: false,
      // oxlint-disable-next-line typescript/no-deprecated entityDecoder appears completely undocumented
      htmlEntities: true,
      processEntities: {
        enabled: true,
        maxEntityCount: Infinity,
        maxTotalExpansions: Infinity,
      },
      trimValues: false,
      stopNodes: ["*.script"],
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
    // fast-xml-parser's htmlEntities option seems to map &nbsp; to
    // regular space (U+0020) instead of non-breaking space (U+00A0).
    // Override the entity mapping to use the correct character.
    // oxlint-disable-next-line typescript/no-deprecated entityDecoder appears completely undocumented
    parser.addEntity("nbsp", "\u00A0")
    // oxlint-disable-next-line typescript/no-deprecated entityDecoder appears completely undocumented
    parser.addEntity("#160", "\u00A0")
    return parser
  })()

  static xmlBuilder = new XMLBuilder({
    preserveOrder: true,
    format: true,
    ignoreAttributes: false,
    suppressEmptyNode: true,
  })

  static xhtmlBuilder = new XMLBuilder({
    preserveOrder: true,
    ignoreAttributes: false,
    stopNodes: ["*.script"],
    suppressEmptyNode: true,
    processEntities: true,
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
   * Given an XMLElement, return its attributes.
   */
  static getXmlAttributes(element: XmlElement): Record<string, string> {
    return Object.fromEntries(
      Object.entries(element[":@"] ?? {}).map(([key, value]) => [
        key.slice(2),
        value,
      ]),
    )
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
    filter?: (node: XmlElement<Name>) => boolean,
  ): XmlElement<Name> | undefined {
    const element = xml.find(
      (e) => name in e && (filter ? filter(e as XmlElement<Name>) : true),
    )
    return element as XmlElement<Name> | undefined
  }

  /**
   * Given an XML structure, find the first descendant matching
   * the provided name and optional filter.
   *
   * Will perform a breadth first search for the element, returning
   * the highest element in the tree matching the name and filter.
   */
  static findXmlDescendantByName<Name extends ElementName>(
    name: Name,
    xml: ParsedXml,
    filter?: (node: XmlElement<Name>) => boolean,
  ): XmlElement<Name> | undefined {
    const found = Epub.findXmlChildByName(name, xml, filter)
    if (found) return found

    for (const node of xml) {
      if (Epub.isXmlTextNode(node)) continue
      const children = Epub.getXmlChildren(node)
      const found = this.findXmlDescendantByName(name, children, filter)
      if (found) return found
    }

    return undefined
  }

  /**
   * Given an XMLNode, determine whether it represents
   * a text node or an XML element.
   */
  static isXmlTextNode(node: XmlNode): node is XmlTextNode {
    return "#text" in node
  }

  private rootfile: string | null = null

  private manifest: Record<string, ManifestItem> | null = null

  private spine: { itemRef: string; linear: boolean }[] | null = null

  private packageMutex = new Mutex()

  /**
   * Storage backend kind in use for this instance
   *
   * Public so callers can declare type-level requirements via {@link InMemoryEpubReader}
   * Orthogonal to the read-only / writable axis (controlled by `readonlyOverride`
   * and the adapter's capability bag)
   */
  readonly storage: EpubStorageKind

  /**
   * Prefer the static factories ({@link Epub.using}, {@link Epub.from},
   * {@link Epub.create}, {@link Epub.upgrade}) over calling this constructor
   * directly. It's public so {@link EpubFactory} can construct instances; nothing
   * else should need to.
   */
  constructor(
    protected adapterClass: EpubStorageAdapterClass,
    protected adapter: EpubStorageAdapter,
    protected inputPath: string | undefined,
    protected readonlyOverride: boolean = false,
  ) {
    this.storage = adapterClass.kind
    this.readXhtmlItemContents = memoize(
      this.readXhtmlItemContents.bind(this),
      // This isn't unnecessary, the generic here just isn't handling the
      // overloaded method type correctly
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      { cacheKey: ([id, as]) => `${id}:${as ?? "xhtml"}` },
    )
  }

  /**
   * Runtime guard for mutation methods
   */
  private assertWritable(): void {
    if (!this.adapterClass.capabilities.writable || this.readonlyOverride) {
      throw new EpubReadOnlyError(
        "cannot mutate a read-only Epub. open via Epub.using(TmpFsAdapter).from(path) (without { readonly: true }) to modify.",
      )
    }
  }

  /**
   * Construct a new EPUB on a writable backend, optionally seeded
   * with the provided metadata. Equivalent to
   * `Epub.using(TmpFsAdapter).create(...)`.
   *
   * @param dublinCore Core metadata terms
   * @param additionalMetadata An array of additional metadata entries
   */
  static async create(
    path: string,
    dublinCore: DublinCore,
    additionalMetadata: EpubMetadata = [],
  ): Promise<Epub> {
    return Epub.using(TmpFsAdapter).create(path, dublinCore, additionalMetadata)
  }

  /**
   * Specify the storage backend to use for the EPUB
   *
   * The returned factory exposes `from`, `create`, and `upgrade`,
   * which route through the supplied adapter.
   *
   * @example
   * ```ts
   * using epub = await Epub.using(TmpFsAdapter).from(path)
   * using reader = await Epub.using(MemoryAdapter).from(buffer, { cache: false })
   * ```
   */
  static using<A extends EpubStorageAdapterClass>(
    adapterClass: A,
  ): EpubFactory<A> {
    return new EpubFactory(adapterClass)
  }

  /**
   * Open an existing EPUB publication, extracting it to a temp directory
   * so writes can mutate the unpacked tree and rezip with `saveAndClose`.
   *
   * Pass `{ readonly: true }` to gate mutations at runtime.
   *
   * prefer `Epub.using(TmpFsAdapter).from(path)` (or
   *   `Epub.using(MemoryAdapter).from(path)` for read-only, in-memory access)
   * @throws {EpubVersionError} when the archive is not a valid EPUB 3
   */
  static async from(pathOrData: ArchiveSource): Promise<Epub>
  static async from(
    pathOrData: ArchiveSource,
    options: FromOptions & { readonly: true },
  ): Promise<EpubReader>
  static async from(
    pathOrData: ArchiveSource,
    options?: FromOptions,
  ): Promise<Epub | EpubReader>
  static async from(
    pathOrData: ArchiveSource,
    options: FromOptions = {},
  ): Promise<Epub | EpubReader> {
    return Epub.using(TmpFsAdapter).from(pathOrData, options)
  }

  static async assertEpub3(epub: Epub): Promise<void> {
    const version = await epub.getVersion()
    if (!version.startsWith("3.")) {
      epub.discardAndClose()
      throw new EpubVersionError(
        "This is not a valid EPUB 3 publication. This library only supports EPUB 3, not EPUB 2. Use Epub.upgrade(path) to convert.",
      )
    }
  }

  async copy(path?: string): Promise<Epub> {
    if (!this.adapter.duplicate) {
      throw new Error(
        `cannot copy an Epub backed by ${this.adapterClass.kind}: adapter does not implement duplicate()`,
      )
    }
    const newAdapter = await this.adapter.duplicate()
    return new Epub(this.adapterClass, newAdapter, path)
  }

  private async removeEntry(href: string) {
    this.assertWritable()
    if (!this.adapter.remove) {
      throw new EpubReadOnlyError(
        `adapter ${this.adapterClass.kind} does not support entry removal`,
      )
    }
    const rootfile = await this.getRootfile()
    await this.adapter.remove(await this.resolveEntry(rootfile, href))
  }

  /**
   * Length of the underlying archive entry for a manifest item, in bytes
   * Necessary to compute the readium page count which is for COMPRESSED content
   * @see {@link https://github.com/readium/architecture/issues/123}
   */
  async getItemArchiveLength(id: string): Promise<number> {
    const rootfile = await this.getRootfile()
    const manifest = await this.getManifest()
    const manifestItem = manifest[id]
    if (!manifestItem)
      throw new Error(`Could not find item with id "${id}" in manifest`)
    return this.adapter.archiveLength(
      await this.resolveEntry(rootfile, manifestItem.href),
    )
  }

  async getRootfile() {
    if (this.rootfile !== null) return this.rootfile

    const containerString = await this.adapter.read(
      "META-INF/container.xml",
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
        node[":@"]?.["@_media-type"] === MediaType.OPF.mime,
    )

    const fullPath = rootfile?.[":@"]?.["@_full-path"]
    if (!fullPath)
      throw new Error(
        "Failed to parse EPUB container.xml: Found no rootfile element",
      )

    this.rootfile = await this.resolveEntry("", fullPath)

    return this.rootfile
  }

  async getPackageDocumentSource(): Promise<string> {
    const rootfile = await this.getRootfile()
    const packageDocumentString = await this.adapter.read(rootfile, "utf-8")

    if (!packageDocumentString)
      throw new Error(
        `Failed to parse EPUB: could not find package document at ${rootfile}`,
      )

    return packageDocumentString
  }

  private async getPackageDocument() {
    const packageDocument = Epub.xmlParser.parse(
      await this.getPackageDocumentSource(),
    ) as ParsedXml

    return normalizeOpfNamespacePrefixes(packageDocument)
  }

  async getPackageElement() {
    const packageDocument = await this.getPackageDocument()

    const packageElement = Epub.findXmlChildByName("package", packageDocument)

    if (!packageElement) {
      throw new Error(
        "Failed to parse EPUB: Found no package element in package document",
      )
    }

    return packageElement
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
  async withPackage(
    producer:
      | ((packageElement: PackageElement) => void)
      | ((packageElement: PackageElement) => PackageElement)
      | ((packageElement: PackageElement) => Promise<PackageElement>)
      | ((packageElement: PackageElement) => Promise<void>),
  ) {
    this.assertWritable()
    await this.packageMutex.runExclusive(async () => {
      const packageDocument = await this.getPackageDocument()

      const packageElement = Epub.findXmlChildByName("package", packageDocument)

      if (!packageElement) {
        throw new Error(
          "Failed to parse EPUB: Found no package element in package document",
        )
      }

      const produced = (await producer(packageElement)) as ParsedXml | undefined

      const updatedPackageDocument = Epub.xmlBuilder.build(
        produced ?? packageDocument,
      )

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
   * Retrieve the first identifier from the dc:identifier element
   * in the EPUB metadata.
   *
   * If there is no dc:identifier element, returns null.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier
   *
   * @deprecated Use {@link getUniqueIdentifier} instead to get the unique identifier,
   * or {@link getIdentifiers} to get all identifiers.
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
   *
   * @deprecated Use {@link setUniqueIdentifier} instead.
   */
  async setIdentifier(identifier: string) {
    await this.replaceMetadata(({ type }) => type === "dc:identifier", {
      type: "dc:identifier",
      properties: {},
      value: identifier,
    })
  }

  /**
   * Retrieve the identifier with the unique identifier id
   * in the EPUB metadata.
   *
   * If there is no unique identifier id, returns the first dc:identifier element.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier
   */
  async getUniqueIdentifier() {
    const metadata = await this.getMetadata()

    const uniqueId = await this.getUniqueIdentifierId()

    if (!uniqueId) {
      return null
    }

    const entry = metadata.find(
      ({ type, id }) => type === "dc:identifier" && id === uniqueId,
    )
    return entry?.value ?? null
  }

  /**
   * Set the unique identifier id for the EPUB.
   *
   * Updates the existing dc:identifier element referenced by the unique identifier id if one exists.
   * Otherwise creates a new element with the provided identifier, and sets the unique identifier id to the new element's id.
   *
   * Note: you likely shouldn't change the unique identifier id unless you are producing a new EPUB.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier
   */
  async setUniqueIdentifier(identifier: string) {
    await this.withPackage(async (packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata) {
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )
      }

      let uniqueId = await this.getUniqueIdentifierId()

      if (!uniqueId) {
        // Create a new unique identifier id
        const newUniqueId = nanoid()
        packageElement[":@"] = {
          ...packageElement[":@"],
          "@_unique-identifier": newUniqueId,
        }
        uniqueId = newUniqueId
      }

      const children = Epub.getXmlChildren(metadata)
      const entry = Epub.findXmlChildByName(
        "dc:identifier",
        children,
        (node) => node[":@"]?.["@_id"] === uniqueId,
      )

      if (entry) {
        children.splice(
          children.indexOf(entry),
          1,
          Epub.createXmlElement("dc:identifier", { id: uniqueId }, [
            Epub.createXmlTextNode(identifier),
          ]),
        )
        return
      }

      children.push(
        Epub.createXmlElement("dc:identifier", { id: uniqueId }, [
          Epub.createXmlTextNode(identifier),
        ]),
      )
    })
  }

  /**
   * Retrieve the id of the publication's unique identifier, as declared by the
   * package element's `unique-identifier` attribute.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier
   */
  async getUniqueIdentifierId(): Promise<string | null> {
    const packageElement = await this.getPackageElement()
    return packageElement[":@"]?.["@_unique-identifier"] ?? null
  }

  /**
   * Collect `dc:identifier` or `dc:source` entries, attaching the value and
   * scheme of any refining `identifier-type` meta (spec D.3.8) and a legacy
   * `opf:scheme` attribute. Values are not interpreted.
   *
   * `onRefinement` is invoked for every other meta refining a collected entry,
   * so callers can surface element-specific refinements (e.g. `source-of` on a
   * `dc:source`).
   */
  private static collectDcEntries<E extends EpubIdentifier>(
    metadata: EpubMetadata,
    type: "dc:identifier" | "dc:source",
    onRefinement?: (entry: E, property: string, value: string) => void,
  ): E[] {
    const entries = metadata
      .filter((entry) => entry.type === type && entry.value !== undefined)
      .map((entry) => ({
        // filtered above, so value is defined
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        value: entry.value!,
        ...(entry.id && { id: entry.id }),
        ...(entry.properties["opf:scheme"] && {
          scheme: entry.properties["opf:scheme"],
        }),
      })) as E[]

    for (const meta of metadata) {
      if (meta.type !== "meta" || meta.value === undefined) continue
      const property = meta.properties["property"]
      const refines = meta.properties["refines"]
      if (!property || !refines) continue

      // drop the leading # from the refines target
      const target = entries.find((t) => t.id === refines.slice(1))
      if (!target) continue

      if (property === "identifier-type") {
        target.identifierType = meta.value
        if (meta.properties["scheme"]) target.scheme = meta.properties["scheme"]
      } else {
        onRefinement?.(target, property, meta.value)
      }
    }

    return entries
  }

  /**
   * Retrieve every `dc:identifier` entry, returned as found.
   *
   * Values are not interpreted. Any refining `identifier-type` meta (spec
   * D.3.8) or legacy `opf:scheme` attribute is surfaced on the entry, but no
   * parsing of the value itself is attempted. To read `dc:source` entries, use
   * {@link getSources}.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier
   */
  async getIdentifiers(): Promise<EpubIdentifier[]> {
    const metadata = await this.getMetadata()
    return Epub.collectDcEntries(metadata, "dc:identifier")
  }

  /**
   * Retrieve every `dc:source` entry, returned as found.
   *
   * Like {@link getIdentifiers}, values are not interpreted. In addition to a
   * refining `identifier-type`, a refining `source-of` meta (spec D.3.11) is
   * surfaced as `sourceOf`.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcsource
   */
  async getSources(): Promise<EpubSource[]> {
    const metadata = await this.getMetadata()
    return Epub.collectDcEntries<EpubSource>(
      metadata,
      "dc:source",
      (source, property) => {
        if (property === "source-of") {
          source.isPageBreakSource = true
        }
      },
    )
  }

  /**
   * Retrieve the `pageBreakSource` property (EPUB 3.4, spec D.2.9), the
   * publication-level source for the source of its page break markers.
   *
   * This property replaces the refining `source-of="pagination"` meta (spec
   * D.3.11), see {@link EpubSource.sourceOf}. If no `pageBreakSource` property is found,
   * we fall back to finding a `dc:source` with a `source-of="pagination"` refinement.
   *
   * @link https://www.w3.org/TR/epub/#pageBreakSource
   */
  async getPageBreakSource(): Promise<EpubSource | null> {
    const entry = await this.findMetadataItem(
      (item) =>
        item.type === "meta" &&
        item.properties["property"] === "pageBreakSource" &&
        !!item.value,
    )

    if (entry) {
      return {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        value: entry.value!,
        id: entry.id,
        identifierType: undefined,
        scheme: undefined,
        isPageBreakSource: true,
      }
    }

    const sources = await this.getSources()
    const source = sources.find((source) => source.isPageBreakSource)
    if (source) {
      return source
    }

    return null
  }

  /**
   * Set the `pageBreakSource` property (EPUB 3.4, spec D.2.9), or remove it when
   * passed null. Replaces an existing `pageBreakSource` meta if present.
   *
   * Pass `none` to indicate the pagination is unique to this publication.
   *
   * @link https://www.w3.org/TR/epub/#pageBreakSource
   */
  async setPageBreakSource(value: string | null): Promise<void> {
    if (value === null) {
      await this.removeMetadata(
        (item) => item.properties["property"] === "pageBreakSource",
      )
      return
    }
    await this.replaceMetadata(
      (item) => item.properties["property"] === "pageBreakSource",
      { type: "meta", properties: { property: "pageBreakSource" }, value },
    )
  }

  /**
   * Replace the publication's `dc:identifier` entries.
   *
   * This replaces ALL existing `dc:identifier` elements except the publication's
   * unique identifier (the one referenced by the package element's
   * `unique-identifier` attribute), which is always preserved and must not be
   * included in the provided list. If included anyway, it is ignored. See
   * {@link setUniqueIdentifier} to change it.
   *
   * Identifiers are placed in the order they are provided.
   *
   * `dc:source` entries are not touched, use {@link setSources} for those.
   *
   * When an entry has an `identifierType`, it is written in the refining form
   * (a `meta` with `property="identifier-type"`, carrying the `scheme`
   * attribute when provided). An entry with only a `scheme` is written using
   * the legacy `opf:scheme` attribute.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcidentifier
   */
  async setIdentifiers(identifiers: EpubIdentifier[]) {
    const uniqueId = await this.getUniqueIdentifierId()

    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      const children = Epub.getXmlChildren(metadata)

      const removedIds = new Set<string>()
      for (let i = children.length - 1; i >= 0; i--) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const node = children[i]!
        if (
          Epub.isXmlTextNode(node) ||
          Epub.getXmlElementName(node) !== "dc:identifier"
        ) {
          continue
        }

        const id = node[":@"]?.["@_id"]
        if (id && id === uniqueId) {
          continue
        }

        if (id) {
          removedIds.add(id)
        }
        children.splice(i, 1)
      }

      Epub.removeRefiningMetas(children, removedIds, ["identifier-type"])

      for (const identifier of identifiers) {
        // we don't allow you to set the unique identifier, you need to use setUniqueIdentifier
        if (identifier.id && identifier.id === uniqueId) continue

        const id =
          identifier.id ??
          (identifier.identifierType !== undefined ? nanoid() : undefined)

        children.push(
          Epub.createXmlElement(
            "dc:identifier",
            {
              ...(id && { id }),
              ...(identifier.scheme &&
                identifier.identifierType === undefined && {
                  "opf:scheme": identifier.scheme,
                }),
            },
            [Epub.createXmlTextNode(identifier.value)],
          ),
        )

        if (identifier.identifierType !== undefined && id) {
          children.push(
            Epub.createXmlElement(
              "meta",
              {
                refines: `#${id}`,
                property: "identifier-type",
                ...(identifier.scheme && { scheme: identifier.scheme }),
              },
              [Epub.createXmlTextNode(identifier.identifierType)],
            ),
          )
        }
      }
    })
  }

  /**
   * Remove `meta` refinements pointing at any of the given ids,
   * restricted to the given `property` values as a cleanup step
   * Mutates `children` in place.
   */
  private static removeRefiningMetas(
    children: ParsedXml,
    ids: ReadonlySet<string>,
    properties: string[],
  ): void {
    for (let i = children.length - 1; i >= 0; i--) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const node = children[i]!
      if (Epub.isXmlTextNode(node) || Epub.getXmlElementName(node) !== "meta") {
        continue
      }
      const property = node[":@"]?.["@_property"]
      if (!property || !properties.includes(property)) continue

      const refines = node[":@"]?.["@_refines"]?.slice(1)
      if (refines && ids.has(refines)) {
        children.splice(i, 1)
      }
    }
  }

  /**
   * Replace the publication's `dc:source` entries.
   *
   * This replaces ALL existing `dc:source` elements (and their refining
   * `identifier-type` / `source-of` metas). `dc:identifier` entries are not
   * touched; use {@link setIdentifiers} for those. Pass an empty array to
   * remove all sources.
   *
   * When an entry has an `identifierType`, it is written in the refining form.
   * A `sourceOf` value is written as a refining `source-of` meta (spec D.3.11).
   * An entry with only a `scheme` uses the legacy `opf:scheme` attribute.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-opf-dcsource
   */
  async setSources(sources: EpubSource[]) {
    await this.withPackage((packageElement) => {
      const metadata = Epub.findXmlChildByName(
        "metadata",
        Epub.getXmlChildren(packageElement),
      )
      if (!metadata)
        throw new Error(
          "Failed to parse EPUB: found no metadata element in package document",
        )

      const children = Epub.getXmlChildren(metadata)

      const removedIds = new Set<string>()
      for (let i = children.length - 1; i >= 0; i--) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const node = children[i]!
        if (
          Epub.isXmlTextNode(node) ||
          Epub.getXmlElementName(node) !== "dc:source"
        ) {
          continue
        }

        const id = node[":@"]?.["@_id"]
        if (id) {
          removedIds.add(id)
        }
        children.splice(i, 1)
      }

      Epub.removeRefiningMetas(children, removedIds, [
        "identifier-type",
        "source-of",
      ])

      for (const source of sources) {
        const needsId =
          source.identifierType !== undefined || source.isPageBreakSource

        const id = source.id ?? (needsId ? nanoid() : undefined)

        children.push(
          Epub.createXmlElement(
            "dc:source",
            {
              ...(id && { id }),
              ...(source.scheme &&
                source.identifierType === undefined && {
                  "opf:scheme": source.scheme,
                }),
            },
            [Epub.createXmlTextNode(source.value)],
          ),
        )

        if (source.identifierType !== undefined && id) {
          children.push(
            Epub.createXmlElement(
              "meta",
              {
                refines: `#${id}`,
                property: "identifier-type",
                ...(source.scheme && { scheme: source.scheme }),
              },
              [Epub.createXmlTextNode(source.identifierType)],
            ),
          )
        }

        if (source.isPageBreakSource && id) {
          children.push(
            Epub.createXmlElement(
              "meta",
              { refines: `#${id}`, property: "source-of" },
              [Epub.createXmlTextNode("pagination")],
            ),
          )
        }
      }
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
    const mediaType = MediaType.fromPath(href)?.mime
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
   * Retrieve the modified date from the dcterms:modified metadata
   * in the EPUB metadata as a Date object.
   *
   * If there is no meta element with dcterms:modified, returns null.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-metadata-last-modified
   */
  async getModifiedDate() {
    const metadata = await this.getMetadata()
    const entry = metadata.find(
      ({ properties }) => properties["property"] === "dcterms:modified",
    )
    if (!entry?.value) return null
    return new Date(entry.value)
  }

  /**
   * Retrieve the layout from the rendition:layout meta element
   * in the EPUB metadata.
   *
   * If there is no meta element, returns 'reflowable'.
   *
   * @link https://www.w3.org/TR/epub-33/#layout
   */
  async getLayout(): Promise<"reflowable" | "pre-paginated"> {
    const metadata = await this.getMetadata()
    const entry = metadata.find(
      ({ properties }) => properties["property"] === "rendition:layout",
    )
    if (entry?.value !== "reflowable" && entry?.value !== "pre-paginated") {
      return "reflowable"
    }
    return entry.value
  }

  /**
   * Retrieve the base direction from the package element.
   *
   * If there is no `dir` attribute on the package element,
   * returns 'auto'.
   *
   * @link https://www.w3.org/TR/epub-33/#attrdef-dir
   */
  async getBaseDirection(): Promise<"ltr" | "rtl" | "auto"> {
    const packageEl = await this.getPackageElement()
    const dir = packageEl[":@"]?.["@_dir"]
    if (dir !== "ltr" && dir !== "rtl" && dir !== "auto") {
      return "auto"
    }
    return dir
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

    try {
      return new Intl.Locale(locale)
    } catch {
      return null
    }
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

    const creators: Array<DcCreator> = []
    const creatorsById = new Map<string, DcCreator>()
    for (const entry of creatorEntries) {
      if (!entry.value) continue
      const creator: DcCreator = { name: entry.value }
      creators.push(creator)
      if (entry.id) creatorsById.set(entry.id, creator)
    }

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
      const creator = creatorsById.get(creatorId)

      if (!creator) return

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
      .map((itemref) => {
        const idRef = itemref[":@"]?.["@_idref"]
        const linear = itemref[":@"]?.["@_linear"]

        return {
          itemRef: idRef,
          linear: linear === "no" ? false : true,
        }
      })
      .filter(
        (itemref): itemref is { itemRef: string; linear: boolean } =>
          !!itemref.itemRef,
      )

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

    const spineItems: (ManifestItem & { linear: boolean })[] = []

    for (const itemref of spine) {
      const item = manifest[itemref.itemRef]
      if (!item) continue
      spineItems.push({ ...item, linear: itemref.linear })
    }

    return spineItems
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

  private async getNavigationChildren(
    ol: XmlElement<"ol">,
    navHref: string,
    { resolveToRoot }: { resolveToRoot?: boolean | undefined } = {},
  ): Promise<NavigationList> {
    const children: NavigationList = []
    const childrenElements = Epub.getXmlChildren(ol).filter(
      (node): node is XmlElement<"li"> =>
        !Epub.isXmlTextNode(node) && Epub.getXmlElementName(node) === "li",
    )

    for (const childEl of childrenElements) {
      const [firstChild, secondChild] = Epub.getXmlChildren(childEl).filter(
        (node): node is XmlElement<"a" | "span" | "ol"> =>
          !Epub.isXmlTextNode(node) &&
          ["a", "span", "ol"].includes(Epub.getXmlElementName(node)),
      )
      if (!firstChild) continue
      if (!["a", "span"].includes(Epub.getXmlElementName(firstChild))) {
        continue
      }
      if (
        Epub.getXmlElementName(firstChild) === "span" &&
        (!secondChild || Epub.getXmlElementName(secondChild) !== "ol")
      ) {
        continue
      }

      const role = firstChild[":@"]?.["@_epub:type"]?.trim()
      children.push({
        title: Epub.getXhtmlTextContent(Epub.getXmlChildren(firstChild)),
        ...(Epub.getXmlElementName(firstChild) === "a" &&
          firstChild[":@"]?.["@_href"] && {
            href: await this.resolveHref(firstChild[":@"]["@_href"], navHref, {
              toRoot: resolveToRoot,
            }),
          }),
        ...(role && { role }),
        ...(secondChild &&
          Epub.getXmlElementName(secondChild) === "ol" && {
            children: await this.getNavigationChildren(secondChild, navHref, {
              resolveToRoot,
            }),
          }),
      })
    }

    return children
  }

  private async getNavigation(
    role: "toc" | "landmarks" | "page-list",
    { resolveToRoot }: { resolveToRoot?: boolean | undefined } = {},
  ): Promise<Navigation | null> {
    const manifest = await this.getManifest()
    const navItem = Object.values(manifest).find((item) =>
      item.properties?.includes("nav"),
    )
    if (!navItem) return null

    const navContents = await this.readXhtmlItemContents(navItem.id)
    const navEl = Epub.findXmlDescendantByName(
      "nav",
      navContents,
      (node) => Epub.getXmlAttributes(node)["epub:type"] === role,
    )

    if (!navEl) return null

    const [firstChild, secondChild] = Epub.getXmlChildren(navEl).filter(
      (node): node is XmlElement<`h${1 | 2 | 3 | 4 | 5 | 6}` | "ol"> =>
        !!(
          !Epub.isXmlTextNode(node) &&
          Epub.getXmlElementName(node).match(/(?:h[1-6]|ol)/)
        ),
    )

    if (!firstChild) return null

    const title = Epub.getXmlElementName(firstChild).match(/h[1-6]/)
      ? Epub.getXhtmlTextContent(Epub.getXmlChildren(firstChild))
      : null

    const list: XmlElement<"ol"> | null =
      Epub.getXmlElementName(firstChild) === "ol"
        ? firstChild
        : secondChild && Epub.getXmlElementName(secondChild) === "ol"
          ? secondChild
          : null
    if (!list) return null

    const children = await this.getNavigationChildren(list, navItem.href, {
      resolveToRoot,
    })

    return {
      ...(title && { title }),
      role,
      children,
    }
  }

  /**
   * Returns the structured table of contents navigation document
   * as a Navigation object.
   *
   * @link https://www.w3.org/TR/epub-33/#sec-nav-toc
   */
  async getTableOfContents({
    resolveToRoot,
  }: { resolveToRoot?: boolean } = {}): Promise<Navigation | null> {
    const navigationToc = await this.getNavigation("toc", { resolveToRoot })
    if (navigationToc) return navigationToc
    const ncxToc = await this.getNcxTableOfContents()
    return {
      role: "toc",
      children: ncxToc,
    }
  }

  /**
   * Returns the structured landmarks navigation document
   * as a Navigation object
   *
   * @link https://www.w3.org/TR/epub-33/#sec-nav-landmarks
   */
  async getLandmarks({
    resolveToRoot,
  }: { resolveToRoot?: boolean } = {}): Promise<Navigation | null> {
    return this.getNavigation("landmarks", { resolveToRoot })
  }

  /**
   * Returns the structured page list navigation document
   * as a Navigation object
   *
   * @link https://www.w3.org/TR/epub-33/#sec-nav-landmarks
   */
  async getPageList({
    resolveToRoot,
  }: { resolveToRoot?: boolean } = {}): Promise<Navigation | null> {
    return this.getNavigation("page-list", { resolveToRoot })
  }

  /**
   * Name the entry a resolved URL addresses.
   *
   * A correctly authored publication percent-encodes its hrefs, so the
   * decoded reading is the one the spec calls for and the one we prefer.
   * Some publications instead write the entry name verbatim, so when the two
   * readings differ we ask the archive which one it holds. A verbatim name
   * carrying a bare `%`, as `100%.xhtml` does, is not a valid encoding at all
   * and can only be its own answer.
   */
  private async entryForUrl(url: URL): Promise<string> {
    const asWritten = url.pathname.slice(1)

    let decoded: string
    try {
      decoded = decodeURIComponent(asWritten)
    } catch {
      return asWritten
    }

    if (decoded === asWritten) {
      return decoded
    }
    if (await this.adapter.exists(decoded)) {
      return decoded
    }
    return (await this.adapter.exists(asWritten)) ? asWritten : decoded
  }

  /**
   * Resolve an href to the name of the archive entry it addresses.
   *
   * @param from The entry the href appears in; it resolves against that
   *   entry's directory
   * @throws when the href addresses something outside the publication
   */
  private async resolveEntry(from: string, href: string): Promise<string> {
    const url = resolveEntryUrl(from, href)
    if (!url) {
      throw new Error(
        `href does not address an entry in this publication: ${href}`,
      )
    }
    return this.entryForUrl(url)
  }

  /**
   * Returns a path-relative-scheme-less URL, relative to the
   * container root.
   *
   * An href that points outside the publication, such as an external link in
   * a navigation document, is handed back unchanged.
   *
   * @param href The href to resolve
   * @param [relativeTo] Optional - The href to resolve this href relative to.
       Use if resolving a relative href from a file other than the package document.
   */
  async resolveHref(
    href: string,
    relativeTo?: string,
    { toRoot }: { toRoot?: boolean | undefined } = {},
  ): Promise<string> {
    if (href.startsWith("#")) return href

    const rootfile = await this.getRootfile()

    const from = relativeTo
      ? await this.resolveEntry(rootfile, relativeTo)
      : rootfile

    const url = resolveEntryUrl(from, href)
    if (!url) return href

    const entry = (await this.entryForUrl(url)).split("/")

    const base = toRoot ? [] : rootfile.split("/").slice(0, -1)
    let shared = 0
    while (shared < base.length && base[shared] === entry[shared]) {
      shared++
    }

    const relative = [
      ...Array<string>(base.length - shared).fill(".."),
      ...entry.slice(shared).map(encodeURIComponent),
    ]
    return relative.join("/") + url.hash
  }

  /**
   * Retrieve the contents of a file, given its href.
   *
   * Optionally takes the href that this href should be resolved relative to,
   * and an encoding parameter.
   *
   * @param href The href of the file to retrieve
   * @param [relitaveTo] Optional - The href to resolve this href relative to.
   *   Use if resolving a relative href from a file other than the package document.
   * @param [encoding] Optional - Must be the string "utf-8". If provided,
   *   the function will encode the data into a unicode string.
   *   Otherwise, the data will be returned as a byte array.
   */
  async readFileContents(href: string, relativeTo?: string): Promise<Uint8Array>
  async readFileContents(
    href: string,
    relativeTo: string | undefined,
    encoding: "utf-8",
  ): Promise<string>
  async readFileContents(
    href: string,
    relativeTo?: string,
    encoding?: "utf-8",
  ): Promise<string | Uint8Array> {
    const rootfile = await this.getRootfile()
    const from = relativeTo
      ? await this.resolveEntry(rootfile, relativeTo)
      : rootfile
    const entry = await this.resolveEntry(from, href)

    const itemEntry = encoding
      ? await this.adapter.read(entry, encoding)
      : await this.adapter.read(entry)
    return itemEntry
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

    const entry = await this.resolveEntry(rootfile, manifestItem.href)
    const itemEntry = encoding
      ? await this.adapter.read(entry, encoding)
      : await this.adapter.read(entry)
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
      Epub.createXmlElement("?xml", { version: "1.0", encoding: "UTF-8" }, [
        { "#text": "" },
      ]),
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
    path: string,
    contents: Uint8Array,
  ): Promise<void>
  private async writeEntryContents(
    path: string,
    contents: string,
    encoding: "utf-8",
  ): Promise<void>
  private async writeEntryContents(
    path: string,
    contents: Uint8Array | string,
    encoding?: "utf-8",
  ): Promise<void> {
    this.assertWritable()
    if (!this.adapter.write) {
      throw new EpubReadOnlyError(
        `adapter ${this.adapterClass.kind} does not support writes`,
      )
    }
    if (encoding === "utf-8") {
      await this.adapter.write(path, contents as string, encoding)
    } else {
      await this.adapter.write(path, contents as Uint8Array)
    }
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
    const entry = await this.resolveEntry(rootfile, manifestItem.href)
    if (encoding === "utf-8") {
      await this.writeEntryContents(entry, contents as string, encoding)
    } else {
      await this.writeEntryContents(entry, contents as Uint8Array)
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
    await this.writeItemContents(id, Epub.xhtmlBuilder.build(contents), "utf-8")
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

    const filename = await this.resolveEntry(rootfile, item.href)

    /* oxlint-disable typescript/no-unnecessary-type-assertion -- tsgolint treats these casts as unnecessary, but each one still narrows the value that is written out */
    const data =
      encoding === "utf-8" || encoding === "xml"
        ? new TextEncoder().encode(
            encoding === "utf-8"
              ? (contents as string)
              : Epub.xmlBuilder.build(contents as ParsedXml),
          )
        : (contents as Uint8Array)
    /* oxlint-enable typescript/no-unnecessary-type-assertion */

    await this.writeEntryContents(filename, data)
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

  /**
   * Returns the EPUB version declared on the package element.
   */
  async getVersion(): Promise<string> {
    const packageElement = await this.getPackageElement()
    return packageElement[":@"]?.["@_version"] ?? "2.0"
  }

  /**
   * Parse the NCX table of contents, if one exists, and return
   * a tree of TocEntry nodes.
   *
   * Useful for both EPUB 2 publications (where the NCX is the
   * primary navigation) and EPUB 3 publications that retain an
   * NCX for backwards compatibility.
   */
  async getNcxTableOfContents(): Promise<NavigationList> {
    const [manifest, packageElement] = await Promise.all([
      this.getManifest(),
      this.getPackageElement(),
    ])

    const spine = Epub.findXmlChildByName(
      "spine",
      Epub.getXmlChildren(packageElement),
    )

    const spineTocId = spine?.[":@"]?.["@_toc"]

    const ncxItem = spineTocId
      ? manifest[spineTocId]
      : Object.values(manifest).find(
          (item) => MediaType.fromMime(item.mediaType ?? "") === MediaType.NCX,
        )

    if (!ncxItem) return []

    const ncxContent = await this.readItemContents(ncxItem.id, "utf-8")
    const ncxXml = Epub.xmlParser.parse(ncxContent) as ParsedXml

    const ncxElement = Epub.findXmlChildByName("ncx", ncxXml)
    if (!ncxElement) return []

    const ncxChildren = Epub.getXmlChildren(ncxElement)

    const navMap =
      Epub.findXmlChildByName("navMap", ncxChildren) ??
      Epub.findXmlChildByName("navmap", ncxChildren)

    if (!navMap) return []

    return this.parseNavPoints(Epub.getXmlChildren(navMap), ncxItem.href)
  }

  private async parseNavPoints(
    nodes: ParsedXml,
    ncxHref: string,
  ): Promise<NavigationList> {
    const entries: NavigationList = []

    for (const node of nodes) {
      if (Epub.isXmlTextNode(node)) continue

      const name = Epub.getXmlElementName(node)

      const isNavPoint = name === "navPoint" || name === "navpoint"

      if (!isNavPoint) continue

      const children = Epub.getXmlChildren(node)

      const navLabel =
        Epub.findXmlChildByName("navLabel", children) ??
        Epub.findXmlChildByName("navlabel", children)

      let title: string | null = null
      if (navLabel) {
        const textEl = Epub.findXmlChildByName(
          "text",
          Epub.getXmlChildren(navLabel),
        )

        if (textEl) {
          title =
            Epub.getXhtmlTextContent(Epub.getXmlChildren(textEl)).trim() || null
        }
      }

      const contentEl = Epub.findXmlChildByName("content", children)
      const src = contentEl?.[":@"]?.["@_src"]
      const href = src ? await this.resolveHref(src, ncxHref) : null

      const childEntries = await this.parseNavPoints(children, ncxHref)

      entries.push({
        title: title ?? `${entries.length}`,
        ...(href && { href }),
        children: childEntries,
      })
    }

    return entries
  }

  /**
   * Retrieve the guide entries from the package document.
   *
   * The guide element is deprecated in EPUB 3 in favor of
   * the landmarks nav, but many publications still include it.
   */
  async getGuideEntries(): Promise<GuideItem[]> {
    const packageElement = await this.getPackageElement()

    const guide = Epub.findXmlChildByName(
      "guide",
      Epub.getXmlChildren(packageElement),
    )

    if (!guide) return []

    return Epub.getXmlChildren(guide)
      .filter(
        (node): node is XmlElement =>
          !Epub.isXmlTextNode(node) && "reference" in node,
      )
      .map((ref) => ({
        href: ref[":@"]?.["@_href"] ?? "",
        title: ref[":@"]?.["@_title"] ?? "",
        type: (ref[":@"]?.["@_type"] ?? "").toLowerCase(),
      }))
      .filter((entry) => entry.href)
  }

  discardAndClose() {
    this.rootfile = null
    this.manifest = null
    this.spine = null
    void this.adapter.dispose()
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
    this.assertWritable()
    if (!this.inputPath) {
      throw new Error("In-memory EPUB files cannot be saved to disk")
    }
    if (!this.adapter.serialize) {
      throw new Error(
        `adapter ${this.adapterClass.kind} does not support serialization`,
      )
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

    await this.adapter.serialize(this.inputPath)
  }

  /**
   * Upgrade an EPUB 2 publication to EPUB 3 in place, returning a new,
   * valid Epub 3 instance. Equivalent to
   * `Epub.using(TmpFsAdapter).upgrade(...)`.
   */
  static async upgrade(
    path: string,
    options: Upgrade.Epub2UpgradeOptions = {},
  ): Promise<Epub> {
    return Epub.using(TmpFsAdapter).upgrade(path, options)
  }

  [Symbol.dispose]() {
    this.discardAndClose()
  }
}

/**
 * Resolves to {@link Epub} for writable adapters, {@link EpubReader} for read-only ones.
 *
 * The conditional pivots on `capabilities.writable`, which must be a literal
 * `true`/`false` on the adapter class (use `as const`) for inference to work.
 */
export type EpubInstanceFor<A extends EpubStorageAdapterClass> =
  A["capabilities"]["writable"] extends true ? Epub : EpubReader

/**
 * Adapter-bound factory returned by {@link Epub.using}.
 *
 * Mirrors the static factory surface (`from`, `create`, `upgrade`) but routes
 * all I/O through the supplied adapter. Each method's signature degrades
 * gracefully when the adapter doesn't support the operation: `create` and
 * `upgrade` throw at runtime if the adapter is read-only or lacks `initEmpty`.
 */
export class EpubFactory<A extends EpubStorageAdapterClass> {
  constructor(public readonly adapterClass: A) {}

  /**
   * Open an existing EPUB through this factory's adapter
   *
   * @throws {EpubVersionError} when the archive is not a valid EPUB 3
   */
  from(
    source: ArchiveSource,
    options: FromOptions & { readonly: true } & AdapterOptions<A>,
  ): Promise<EpubReader & { storage: A["kind"] }>
  from(
    source: ArchiveSource,
    options?: FromOptions & AdapterOptions<A>,
  ): Promise<EpubInstanceFor<A> & { storage: A["kind"] }>
  async from(
    source: ArchiveSource,
    options: FromOptions = {},
  ): Promise<
    (Epub & { storage: A["kind"] }) | (EpubReader & { storage: A["kind"] })
  > {
    const adapter = await this.adapterClass.init(
      source, // oxlint-disable-line typescript/no-unnecessary-type-assertion
      options as AdapterOptions<A>,
    )
    const inputPath = typeof source === "string" ? source : undefined
    const readonlyOverride = options.readonly === true

    const epub = new Epub(
      this.adapterClass,
      adapter,
      inputPath,
      readonlyOverride,
    )

    try {
      await epub.getPackageElement()
    } catch (e) {
      epub.discardAndClose()
      console.error(e)
      throw new Error(
        "This is not a valid EPUB publication. Could not read the package document.",
      )
    }

    try {
      await Epub.assertEpub3(epub)
    } catch (error) {
      epub.discardAndClose()
      throw error
    }
    return epub
  }

  async readPackageDocumentSource(
    source: ArchiveSource,
    options: AdapterOptions<A> = {} as AdapterOptions<A>,
  ): Promise<string> {
    const adapter = await this.adapterClass.init(source, options)
    const epub = new Epub(
      this.adapterClass,
      adapter,
      typeof source === "string" ? source : undefined,
      true,
    )

    try {
      return await epub.getPackageDocumentSource()
    } finally {
      epub.discardAndClose()
    }
  }

  /**
   * Construct a new EPUB on this factory's adapter, optionally seeded
   * with the provided metadata. Requires a writable adapter that
   * implements `initEmpty` (today: {@link TmpFsAdapter}).
   *
   * @throws when the adapter is read-only or does not implement initEmpty
   */
  async create(
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
  ): Promise<EpubInstanceFor<A>> {
    if (!this.adapterClass.capabilities.writable) {
      throw new EpubReadOnlyError(
        `adapter ${this.adapterClass.kind} is read-only; cannot create`,
      )
    }
    if (!this.adapterClass.initEmpty) {
      throw new Error(
        `adapter ${this.adapterClass.kind} does not support create() (missing initEmpty)`,
      )
    }

    const adapter = await this.adapterClass.initEmpty()
    if (!adapter.write) {
      // unreachable: a writable adapter must implement write
      throw new Error(
        `adapter ${this.adapterClass.kind} declared writable but did not implement write()`,
      )
    }

    const textInfo =
      typeof language.getTextInfo === "function"
        ? language.getTextInfo()
        : language.textInfo
    const encoder = new TextEncoder()
    const container = encoder.encode(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile media-type="${MediaType.OPF.mime}" full-path="OEBPS/content.opf"/>
  </rootfiles>
</container>
`)
    await adapter.write("META-INF/container.xml", container)

    const packageDocument = encoder.encode(`<?xml version="1.0"?>
<package unique-identifier="pub-id" dir="${textInfo?.direction ?? "ltr"}" xml:lang="${language.toString()}" version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata>
  </metadata>
  <manifest>
  </manifest>
  <spine>
  </spine>
</package>
`)
    await adapter.write("OEBPS/content.opf", packageDocument)

    const epub = new Epub(this.adapterClass, adapter, path)
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

    return epub as EpubInstanceFor<A> // oxlint-disable-line typescript/no-unnecessary-type-assertion
  }

  /**
   * Upgrade an EPUB 2 publication to EPUB 3 in place using this
   * factory's adapter, returning a new, valid Epub 3 instance.
   *
   * Performs the following transformations:
   *  - upgrades OPF metadata to EPUB 3 conventions
   *  - scans XHTML documents and adds manifest item properties
   *  - parses the NCX into a TOC tree and generates a nav.xhtml
   *  - removes the NCX file and the guide element (configurable)
   *  - fixes common font MIME types
   *  - bumps the package version to 3.0
   *  - goes over each xhtml item and rewrites it using XMLParser to make sure the output is valid XHTML
   *
   * Requires a writable adapter. When {@link Upgrade.Epub2UpgradeOptions.outputPath}
   * is set, the source file is copied to that path on disk first; this
   * only makes sense for adapters whose `source` is a real fs path.
   *
   * @throws when the adapter is read-only
   */
  async upgrade(
    path: string,
    options: Upgrade.Epub2UpgradeOptions = {},
  ): Promise<EpubInstanceFor<A>> {
    if (!this.adapterClass.capabilities.writable) {
      throw new EpubReadOnlyError(
        `adapter ${this.adapterClass.kind} is read-only; cannot upgrade`,
      )
    }
    const { removeNcx = false, outputPath } = options

    if (outputPath) await copyFile(path, outputPath)

    const source = outputPath ?? path
    const adapter = await this.adapterClass.init(
      source, // oxlint-disable-line typescript/no-unnecessary-type-assertion
      options as AdapterOptions<A>,
    )
    const epub = new Epub(this.adapterClass, adapter, source)
    try {
      await epub.getPackageElement()
    } catch (e) {
      epub.discardAndClose()
      console.error(e)
      throw new Error(
        "This is not a valid EPUB publication. Could not read the package document.",
      )
    }

    try {
      const version = await epub.getVersion()
      if (version.startsWith("3.")) {
        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
        return epub as EpubInstanceFor<A>
      }

      const tocEntries = await epub.getNcxTableOfContents()

      let landmarks: Upgrade.Landmark[] = []

      await epub.withPackage((pkg) => {
        landmarks = Upgrade.extractGuideLandmarks(pkg)

        Upgrade.upgradePackageMetadata(pkg)
        Upgrade.fixFontMimeTypes(pkg)
        Upgrade.removeGuide(pkg)

        if (removeNcx) {
          Upgrade.removeSpineTocRef(pkg)
        }

        Upgrade.setPackageVersion(pkg, "3.0")
      })

      // scan xhtml items for svg/script/mathml/switch properties
      await Upgrade.collectManifestProperties(epub)

      // maybe remove ncx
      if (removeNcx) {
        await Upgrade.removeNcx(epub)
      }

      const navHref = await Upgrade.chooseNavHref(epub)
      const navContent = await Upgrade.buildNavDocument(
        epub,
        tocEntries,
        landmarks,
      )

      await epub.addManifestItem(
        {
          id: "nav",
          href: navHref,
          mediaType: MediaType.XHTML.mime,
          properties: ["nav"],
        },
        navContent,
        "utf-8",
      )

      // go over each xhtml item and replace the outdated
      // <!DOCTYPE html PUBLIC '-//W3C//DTD XHTML 1.1//EN' 'http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd'>
      // with <!DOCTYPE html>
      const manifest = await epub.getManifest()
      for (const item of Object.values(manifest)) {
        if (MediaType.fromMime(item.mediaType ?? "") !== MediaType.XHTML)
          continue

        const contents = await epub.readXhtmlItemContents(item.id)
        await epub.writeXhtmlItemContents(item.id, contents)
      }

      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- tsgolint treats the cast as unnecessary but it still narrows the type
      return epub as EpubInstanceFor<A>
    } catch (error) {
      epub.discardAndClose()
      throw error
    }
  }
}

export type { Epub2UpgradeOptions, Landmark } from "./upgrade.ts"
