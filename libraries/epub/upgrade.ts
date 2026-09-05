import { nanoid } from "nanoid"

import { MediaType } from "@storyteller-platform/media-types"

import {
  type ElementName,
  Epub,
  type NavigationItem,
  type PackageElement,
  type ParsedXml,
  type XmlElement,
} from "./index.ts"

const GUIDE_TO_EPUBTYPE: Record<string, string> = {
  acknowledgements: "acknowledgments",
  "other.afterword": "afterword",
  "other.appendix": "appendix",
  "other.backmatter": "backmatter",
  bibliography: "bibliography",
  text: "bodymatter",
  "other.chapter": "chapter",
  colophon: "colophon",
  "other.conclusion": "conclusion",
  "other.contributors": "contributors",
  "copyright-page": "copyright-page",
  cover: "cover",
  dedication: "dedication",
  "other.division": "division",
  epigraph: "epigraph",
  "other.epilogue": "epilogue",
  "other.errata": "errata",
  "other.footnotes": "footnotes",
  foreword: "foreword",
  "other.frontmatter": "frontmatter",
  glossary: "glossary",
  "other.halftitlepage": "halftitlepage",
  "other.imprint": "imprint",
  "other.imprimatur": "imprimatur",
  index: "index",
  "other.introduction": "introduction",
  "other.landmarks": "landmarks",
  "other.loa": "loa",
  loi: "loi",
  lot: "lot",
  "other.lov": "lov",
  notes: "",
  "other.notice": "notice",
  "other.other-credits": "other-credits",
  "other.part": "part",
  "other.preamble": "preamble",
  preface: "preface",
  "other.prologue": "prologue",
  "other.rearnotes": "rearnotes",
  "other.subchapter": "subchapter",
  "title-page": "titlepage",
  toc: "toc",
  "other.volume": "volume",
  "other.warning": "warning",
}

const XHTML_MEDIA_TYPES = new Set<MediaType>([MediaType.XHTML, MediaType.HTML])

export interface Landmark {
  href: string
  title: string
  type: string
}

export interface Epub2UpgradeOptions {
  /**
   * The path to the output file. If provided, the input file will be copied to the output path.
   */
  outputPath?: string
  /**
   * Whether to remove the NCX file, as it's technically optional in EPUB 3.
   */
  removeNcx?: boolean
}

// xml helpers

function getMetadataElement(pkg: PackageElement) {
  return Epub.findXmlChildByName("metadata", Epub.getXmlChildren(pkg))
}

function getManifestElement(pkg: PackageElement) {
  return Epub.findXmlChildByName("manifest", Epub.getXmlChildren(pkg))
}

function getSpineElement(pkg: PackageElement) {
  return Epub.findXmlChildByName("spine", Epub.getXmlChildren(pkg))
}

function ensureId(element: XmlElement): string {
  const existing = element[":@"]?.["@_id"]
  if (existing) return existing

  const id = `id-${nanoid(8)}`
  element[":@"] ??= {}
  element[":@"]["@_id"] = id
  return id
}

function findAllByName<Name extends ElementName>(
  name: Name,
  xml: ParsedXml,
): XmlElement<Name>[] {
  return xml.filter(
    (node): node is XmlElement<Name> =>
      !Epub.isXmlTextNode(node) && name in node,
  )
}

function hasElementDeep(xml: ParsedXml, name: string): boolean {
  for (const node of xml) {
    if (Epub.isXmlTextNode(node)) continue

    if (Epub.getXmlElementName(node) === name) return true

    if (hasElementDeep(Epub.getXmlChildren(node), name)) return true
  }

  return false
}

function textContentOf(element: XmlElement): string {
  return Epub.getXhtmlTextContent(Epub.getXmlChildren(element)).trim()
}

function removeFromArray<T>(array: T[], item: T): void {
  const idx = array.indexOf(item)
  if (idx !== -1) array.splice(idx, 1)
}

// ---------------------------------------------------------------------------
export function upgradeIdentifiers(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const ident of findAllByName("dc:identifier", metadata.metadata)) {
    const attrs = ident[":@"] ?? {}
    let val = textContentOf(ident)
    let scheme = attrs["@_opf:scheme"]

    if (val.toLowerCase().startsWith("urn:")) {
      const rest = val.slice(4)
      const colonIdx = rest.indexOf(":")

      if (colonIdx > 0) {
        scheme = rest.slice(0, colonIdx)
        val = rest.slice(colonIdx + 1)
      }
    }

    if (scheme && val && !scheme.toLowerCase().startsWith("uri")) {
      val = `${scheme}:${val}`
    }

    const id = attrs["@_id"]
    ident[":@"] = id ? { "@_id": id } : {}
    Epub.replaceXmlChildren(ident, [Epub.createXmlTextNode(val)])
  }
}

export function upgradeTitle(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  const titles = findAllByName("dc:title", metadata.metadata)
  let firstTitle: XmlElement<"dc:title"> | null = null

  for (const title of titles) {
    const text = textContentOf(title)

    if (!text) {
      removeFromArray(metadata.metadata, title)
      continue
    }

    firstTitle ??= title
  }

  if (!firstTitle) return

  const titleId = ensureId(firstTitle)

  metadata.metadata.push(
    Epub.createXmlElement(
      "meta",
      { refines: `#${titleId}`, property: "title-type" },
      [Epub.createXmlTextNode("main")],
    ),
  )
}

export function upgradeLanguages(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  const langs = findAllByName("dc:language", metadata.metadata)

  if (langs.length > 0) {
    for (const lang of langs) {
      const id = lang[":@"]?.["@_id"]
      lang[":@"] = id ? { "@_id": id } : {}
    }
    return
  }

  metadata.metadata.push(
    Epub.createXmlElement("dc:language", {}, [Epub.createXmlTextNode("und")]),
  )
}

export function upgradeAuthors(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const which of ["dc:creator", "dc:contributor"] as const) {
    for (const elem of findAllByName(which, metadata.metadata)) {
      const attrs = elem[":@"] ?? {}
      const role = attrs["@_opf:role"]
      const sort = attrs["@_opf:file-as"]

      const elemId = role || sort ? ensureId(elem) : attrs["@_id"]

      // strip all non-id attributes
      elem[":@"] = elemId ? { "@_id": elemId } : {}

      if (role) {
        metadata.metadata.push(
          Epub.createXmlElement(
            "meta",
            {
              refines: `#${elemId}`,
              property: "role",
              scheme: "marc:relators",
            },
            [Epub.createXmlTextNode(role)],
          ),
        )
      }

      if (sort) {
        metadata.metadata.push(
          Epub.createXmlElement(
            "meta",
            { refines: `#${elemId}`, property: "file-as" },
            [Epub.createXmlTextNode(sort)],
          ),
        )
      }
    }
  }
}

export function upgradeDate(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  const dates = findAllByName("dc:date", metadata.metadata)
  let kept = false

  for (const date of dates) {
    const text = textContentOf(date)

    if (!text || kept) {
      removeFromArray(metadata.metadata, date)
      continue
    }

    kept = true
    const id = date[":@"]?.["@_id"]
    date[":@"] = id ? { "@_id": id } : {}
  }
}

export function upgradeMeta(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const meta of findAllByName("meta", metadata.metadata)) {
    const attrs = meta[":@"] ?? {}
    const name = attrs["@_name"] ?? ""
    const content = attrs["@_content"] ?? ""

    let prop: string | null = null
    let value = content

    const cleanName = name.startsWith("rendition:")
      ? name.slice("rendition:".length)
      : name

    if (["orientation", "layout", "spread"].includes(cleanName)) {
      prop = `rendition:${cleanName}`
    } else if (name === "fixed-layout") {
      prop = "rendition:layout"
      value = content.toLowerCase() === "true" ? "pre-paginated" : "reflowable"
    } else if (name === "orientation-lock") {
      prop = "rendition:orientation"
      const map: Record<string, string> = {
        portrait: "portrait",
        landscape: "landscape",
      }
      value = map[content.toLowerCase()] ?? "auto"
    }

    if (!prop) continue

    delete attrs["@_name"]
    delete attrs["@_content"]
    attrs["@_property"] = prop
    Epub.replaceXmlChildren(meta, [Epub.createXmlTextNode(value)])
  }
}

export function upgradeCover(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  const manifest = getManifestElement(pkg)

  if (!metadata || !manifest) return

  for (const meta of findAllByName("meta", metadata.metadata)) {
    const attrs = meta[":@"]
    const isCoverMeta = attrs?.["@_name"] === "cover" && attrs["@_content"]

    if (!isCoverMeta) continue

    const itemId = attrs["@_content"]

    for (const item of findAllByName("item", manifest.manifest)) {
      const itemAttrs = item[":@"]
      if (!itemAttrs || itemAttrs["@_id"] !== itemId) continue

      const mediaType = (itemAttrs["@_media-type"] ?? "").toLowerCase()

      // only mark actual images, not html wrappers
      const isImage =
        mediaType && !mediaType.includes("xml") && !mediaType.includes("html")

      if (!isImage) continue

      const existing = (itemAttrs["@_properties"] ?? "")
        .split(" ")
        .filter(Boolean)

      const props = new Set(existing)
      props.add("cover-image")
      itemAttrs["@_properties"] = [...props].sort().join(" ")
    }
  }
}

export function removeInvalidDcAttrs(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const node of metadata.metadata) {
    if (Epub.isXmlTextNode(node)) continue

    const name = Epub.getXmlElementName(node)
    if (!name.startsWith("dc:")) continue

    const attrs = node[":@"]
    if (!attrs) continue

    const id = attrs["@_id"]
    node[":@"] = id ? { "@_id": id } : {}
  }
}

export function setLastModified(pkg: PackageElement): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (let i = metadata.metadata.length - 1; i >= 0; i--) {
    const node = metadata.metadata[i]
    if (!node || Epub.isXmlTextNode(node)) continue

    if (node[":@"]?.["@_property"] === "dcterms:modified") {
      metadata.metadata.splice(i, 1)
    }
  }

  const now = new Date().toISOString().replace(/\.\d+/, "")

  metadata.metadata.push(
    Epub.createXmlElement("meta", { property: "dcterms:modified" }, [
      Epub.createXmlTextNode(now),
    ]),
  )
}

export function upgradePackageMetadata(pkg: PackageElement): void {
  upgradeIdentifiers(pkg)
  upgradeTitle(pkg)
  upgradeLanguages(pkg)
  upgradeAuthors(pkg)
  upgradeDate(pkg)
  upgradeMeta(pkg)
  upgradeCover(pkg)
  removeInvalidDcAttrs(pkg)
  setLastModified(pkg)
}

export function extractGuideLandmarks(pkg: PackageElement): Landmark[] {
  const guide = Epub.findXmlChildByName("guide", Epub.getXmlChildren(pkg))

  if (!guide) return []

  const landmarks: Landmark[] = []

  for (const node of Epub.getXmlChildren(guide)) {
    if (Epub.isXmlTextNode(node)) continue
    if (!("reference" in node)) continue

    const attrs = node[":@"] ?? {}
    const href = attrs["@_href"] ?? ""
    const title = attrs["@_title"] ?? ""
    const guideType = (attrs["@_type"] ?? "").toLowerCase()

    const epubType = GUIDE_TO_EPUBTYPE[guideType]
    if (epubType === undefined || !href) continue

    landmarks.push({ href, title, type: epubType })
  }

  return landmarks
}

export function removeGuide(pkg: PackageElement): void {
  const children = Epub.getXmlChildren(pkg)
  const guide = Epub.findXmlChildByName("guide", children)

  if (guide) {
    removeFromArray(children, guide)
  }
}

export function removeSpineTocRef(pkg: PackageElement): void {
  const spine = getSpineElement(pkg)
  if (!spine?.[":@"]) return

  delete spine[":@"]["@_toc"]
}

export async function collectManifestProperties(epub: Epub): Promise<void> {
  const manifest = await epub.getManifest()

  for (const item of Object.values(manifest)) {
    const mediaType = MediaType.fromMime(item.mediaType ?? "")
    if (!mediaType || !XHTML_MEDIA_TYPES.has(mediaType)) continue

    let xml: ParsedXml
    try {
      xml = await epub.readXhtmlItemContents(item.id)
    } catch {
      continue
    }

    const props = new Set(item.properties ?? [])
    const before = props.size

    if (hasElementDeep(xml, "svg")) props.add("svg")
    if (hasElementDeep(xml, "script")) props.add("scripted")
    if (hasElementDeep(xml, "math")) props.add("mathml")
    if (hasElementDeep(xml, "epub:switch")) props.add("switch")

    if (props.size === before) continue

    await epub.updateManifestItem(item.id, {
      ...item,
      properties: [...props].sort(),
    })
  }
}

export function fixFontMimeTypes(pkg: PackageElement): void {
  const manifest = getManifestElement(pkg)
  if (!manifest) return

  for (const item of findAllByName("item", manifest.manifest)) {
    const declared = item[":@"]?.["@_media-type"] ?? ""
    if (!MediaType.fromMime(declared)?.is("font")) continue

    const corrected = MediaType.fromPath(item[":@"]?.["@_href"] ?? "")
    if (!corrected?.is("font") || corrected.mime === declared) continue

    item[":@"] ??= {}
    item[":@"]["@_media-type"] = corrected.mime
  }
}

export function buildTocOl(entries: NavigationItem[]): XmlElement<"ol"> {
  const children: ParsedXml = entries.map((entry) => {
    const label = entry.title.replace(/\s+/g, " ").trim()
    const liChildren: ParsedXml = []

    if (entry.href) {
      liChildren.push(
        Epub.createXmlElement("a", { href: entry.href }, [
          Epub.createXmlTextNode(label),
        ]),
      )
    } else {
      liChildren.push(
        Epub.createXmlElement("span", {}, [Epub.createXmlTextNode(label)]),
      )
    }

    if (entry.children && entry.children.length > 0) {
      liChildren.push(buildTocOl(entry.children))
    }

    return Epub.createXmlElement("li", {}, liChildren)
  })

  return Epub.createXmlElement("ol", {}, children)
}

export async function buildNavDocument(
  epub: Epub,
  tocEntries: NavigationItem[],
  landmarks: Landmark[],
): Promise<string> {
  let tocOl: XmlElement<"ol">

  if (tocEntries.length > 0) {
    tocOl = buildTocOl(tocEntries)
  } else {
    // epub 3 requires a non-empty <ol>, fall back to first spine item
    const spineItems = await epub.getSpineItems()
    const firstHref = spineItems[0]?.href ?? "#"

    tocOl = Epub.createXmlElement("ol", {}, [
      Epub.createXmlElement("li", {}, [
        Epub.createXmlElement("a", { href: firstHref }, [
          Epub.createXmlTextNode("Start"),
        ]),
      ]),
    ])
  }

  const tocNav = Epub.createXmlElement("nav", { "epub:type": "toc" }, [
    Epub.createXmlElement("h1", {}, [
      Epub.createXmlTextNode("Table of Contents"),
    ]),
    tocOl,
  ])

  const body: ParsedXml = [tocNav]

  const validLandmarks = landmarks.filter((lm) => lm.type)

  if (validLandmarks.length > 0) {
    const lmOl = Epub.createXmlElement(
      "ol",
      {},
      validLandmarks.map((lm) =>
        Epub.createXmlElement("li", {}, [
          Epub.createXmlElement("a", { "epub:type": lm.type, href: lm.href }, [
            Epub.createXmlTextNode(lm.title || lm.type),
          ]),
        ]),
      ),
    )

    body.push(
      Epub.createXmlElement("nav", { "epub:type": "landmarks", hidden: "" }, [
        lmOl,
      ]),
    )
  }

  const head = [
    Epub.createXmlElement("title", {}, [Epub.createXmlTextNode("Navigation")]),
  ]

  const navDoc = await epub.createXhtmlDocument(body, head)
  return Epub.xhtmlBuilder.build(navDoc) as string
}

export function setPackageVersion(pkg: PackageElement, version: string): void {
  pkg[":@"] ??= {}
  pkg[":@"]["@_version"] = version
}

export async function chooseNavHref(epub: Epub): Promise<string> {
  const manifest = await epub.getManifest()
  const existingHrefs = new Set(
    Object.values(manifest).map((item) => item.href),
  )

  let candidate = "nav.xhtml"
  let i = 1

  while (existingHrefs.has(candidate)) {
    candidate = `nav${i}.xhtml`
    i++
  }

  return candidate
}

export async function removeNcx(epub: Epub): Promise<void> {
  const manifest = await epub.getManifest()

  const ncxItem = Object.values(manifest).find(
    (item) => MediaType.fromMime(item.mediaType ?? "") === MediaType.NCX,
  )

  if (ncxItem) {
    await epub.removeManifestItem(ncxItem.id)
  }
}
