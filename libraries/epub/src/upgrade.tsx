/** @jsxImportSource @storyteller-platform/epub */

import { type Document, type Element } from "@xmldom/xmldom"
import { nanoid } from "nanoid"

import { MediaType } from "@storyteller-platform/media-types"

import { type Epub, type NavigationItem } from "./index.tsx"
import {
  findXmlChildByNameNS,
  findXmlDescendantByName,
  findXmlDescendantByNameNS,
  insert,
  NS,
  replace,
  serialize,
  text,
  x,
} from "./xml.ts"

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

function getMetadataElement(pkg: Element) {
  return findXmlChildByNameNS(NS.opf, "metadata", pkg)
}

function getManifestElement(pkg: Element) {
  return findXmlChildByNameNS(NS.opf, "manifest", pkg)
}

function getSpineElement(pkg: Element) {
  return findXmlChildByNameNS(NS.opf, "spine", pkg)
}

/**
 * Replace an outdated document type declaration with `<!DOCTYPE html>`.
 *
 * EPUB 3 XHTML content documents must conform to the HTML5 conformance
 * criteria, which require `<!DOCTYPE html>`.
 */
export function normalizeDoctype(doc: Document): void {
  const doctype = doc.doctype
  if (doctype && doctype.publicId === "" && doctype.systemId === "") return

  if (doctype) doc.removeChild(doctype)

  doc.insertBefore(
    doc.implementation.createDocumentType("html", "", ""),
    doc.documentElement,
  )

  return
}

function ensureId(element: Element): string {
  const existing = element.getAttribute("id")
  if (existing) return existing

  const id = `id-${nanoid(8)}`
  element.setAttribute("id", id)
  return id
}

function findAllByNameNS(
  namespaceUri: string | null,
  name: string,
  element: Element,
) {
  return element.children.filter(
    (node) =>
      (!namespaceUri || node.namespaceURI === namespaceUri) &&
      node.localName === name,
  )
}

function findAllByName(name: string, element: Element) {
  return findAllByNameNS(null, name, element)
}

// ---------------------------------------------------------------------------
export function upgradeIdentifiers(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const ident of findAllByNameNS(NS.dc, "identifier", metadata)) {
    let val = ident.textContent ?? ""
    let scheme = ident.getAttributeNS(NS.opf, "scheme")

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

    const id = ident.getAttribute("id")
    replace(metadata, <dc:identifier id={id}>{val}</dc:identifier>, ident)
  }
}

export function upgradeTitle(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  const titles = findAllByNameNS(NS.dc, "title", metadata)
  let firstTitle: Element | null = null

  for (const title of titles) {
    const text = title.textContent?.trim()

    if (!text) {
      metadata.removeChild(title)
      continue
    }

    firstTitle ??= title
  }

  if (!firstTitle) return

  const titleId = ensureId(firstTitle)

  insert(
    metadata,
    <meta refines={`#${titleId}`} property="title-type">
      main
    </meta>,
  )
}

export function upgradeLanguages(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  const langs = findAllByNameNS(NS.dc, "language", metadata)

  if (langs.length > 0) {
    for (const lang of langs) {
      const id = lang.getAttribute("id")
      replace(
        metadata,
        <dc:language id={id}>{Array.from(lang.childNodes)}</dc:language>,
        lang,
      )
    }
    return
  }

  insert(metadata, <dc:language>und</dc:language>)
}

export function upgradeAuthors(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const which of ["creator", "contributor"] as const) {
    for (const elem of findAllByNameNS(NS.dc, which, metadata)) {
      const role = elem.getAttributeNS(NS.opf, "role")
      const sort = elem.getAttributeNS(NS.opf, "file-as")

      const elemId = role || sort ? ensureId(elem) : elem.getAttribute("id")

      // strip all non-id attributes
      replace(
        metadata,
        x(
          `dc:${which}`,
          elemId === null ? null : { id: elemId },
          ...elem.childNodes,
        ),
        elem,
      )

      if (role) {
        insert(
          metadata,
          <meta refines={`#${elemId}`} property="role" scheme="marc:relators">
            {role}
          </meta>,
        )
      }

      if (sort) {
        insert(
          metadata,
          <meta refines={`#${elemId}`} property="file-as">
            {sort}
          </meta>,
        )
      }
    }
  }
}

export function upgradeDate(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  const dates = findAllByNameNS(NS.dc, "date", metadata)
  let kept = false

  for (const date of dates) {
    const text = date.textContent

    if (!text || kept) {
      metadata.removeChild(date)
      continue
    }

    kept = true
    const id = date.getAttribute("id")
    replace(
      metadata,
      <dc:date id={id}>{Array.from(date.childNodes)}</dc:date>,
      date,
    )
  }
}

export function upgradeMeta(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const meta of findAllByName("meta", metadata)) {
    const name = meta.getAttribute("name") ?? ""
    const content = meta.getAttribute("content") ?? ""

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

    meta.removeAttribute("name")
    meta.removeAttribute("content")
    meta.setAttribute("property", prop)
    while (meta.firstChild) {
      meta.removeChild(meta.firstChild)
    }
    insert(meta, text(value))
  }
}

export function upgradeCover(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  const manifest = getManifestElement(pkg)

  if (!metadata || !manifest) return

  for (const meta of findAllByName("meta", metadata)) {
    const content = meta.getAttribute("content")
    const isCoverMeta = meta.getAttribute("name") === "cover" && content

    if (!isCoverMeta) continue

    const itemId = content

    for (const item of findAllByName("item", manifest)) {
      if (item.getAttribute("id") !== itemId) continue

      const mediaType = (item.getAttribute("media-type") ?? "").toLowerCase()

      // only mark actual images, not html wrappers
      const isImage =
        mediaType && !mediaType.includes("xml") && !mediaType.includes("html")

      if (!isImage) continue

      const existing = (item.getAttribute("properties") ?? "")
        .split(" ")
        .filter(Boolean)

      const props = new Set(existing)
      props.add("cover-image")
      item.setAttribute("properties", [...props].sort().join(" "))
    }
  }
}

export function removeInvalidDcAttrs(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const node of Array.from(metadata.children)) {
    if (node.namespaceURI !== NS.dc) continue

    for (const attr of Array.from(node.attributes)) {
      if (attr.name === "id" || attr.name.startsWith("xmlns:")) continue

      node.removeAttributeNode(attr)
    }
  }
}

export function setLastModified(pkg: Element): void {
  const metadata = getMetadataElement(pkg)
  if (!metadata) return

  for (const node of Array.from(metadata.children)) {
    if (node.getAttribute("property") === "dcterms:modified") {
      metadata.removeChild(node)
    }
  }

  const now = new Date().toISOString().replace(/\.\d+/, "")

  insert(metadata, <meta property="dcterms:modified">{now}</meta>)
}

export function upgradePackageMetadata(pkg: Element): void {
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

export function extractGuideLandmarks(pkg: Element): Landmark[] {
  const guide = findXmlChildByNameNS(NS.opf, "guide", pkg)

  if (!guide) return []

  const landmarks: Landmark[] = []

  for (const node of Array.from(guide.children)) {
    if (!("reference" in node)) continue

    const href = node.getAttribute("href") ?? ""
    const title = node.getAttribute("title") ?? ""
    const guideType = (node.getAttribute("type") ?? "").toLowerCase()

    const epubType = GUIDE_TO_EPUBTYPE[guideType]
    if (epubType === undefined || !href) continue

    landmarks.push({ href, title, type: epubType })
  }

  return landmarks
}

export function removeGuide(pkg: Element): void {
  const guide = findXmlChildByNameNS(NS.opf, "guide", pkg)

  if (guide) {
    pkg.removeChild(guide)
  }
}

export function removeSpineTocRef(pkg: Element): void {
  const spine = getSpineElement(pkg)

  spine?.removeAttribute("toc")
}

export async function collectManifestProperties(epub: Epub): Promise<void> {
  const manifest = await epub.getManifest()

  for (const item of Object.values(manifest)) {
    const mediaType = MediaType.fromMime(item.mediaType ?? "")
    if (!mediaType || !XHTML_MEDIA_TYPES.has(mediaType)) continue

    let documentElement: Element | null
    try {
      documentElement = (await epub.readXhtmlItemContents(item.id))
        .documentElement
    } catch {
      continue
    }
    if (!documentElement) continue

    const props = new Set(item.properties ?? [])
    const before = props.size

    if (findXmlDescendantByName("svg", documentElement)) props.add("svg")
    if (findXmlDescendantByName("script", documentElement))
      props.add("scripted")
    if (findXmlDescendantByName("math", documentElement)) props.add("mathml")
    if (findXmlDescendantByNameNS(NS.epub, "switch", documentElement))
      props.add("switch")

    if (props.size === before) continue

    await epub.updateManifestItem(item.id, {
      ...item,
      properties: [...props].sort(),
    })
  }
}

export function fixFontMimeTypes(pkg: Element): void {
  const manifest = getManifestElement(pkg)
  if (!manifest) return

  for (const item of findAllByName("item", manifest)) {
    const declared = item.getAttribute("media-type") ?? ""
    if (!MediaType.fromMime(declared)?.is("font")) continue

    const corrected = MediaType.fromPath(item.getAttribute("href") ?? "")
    if (!corrected?.is("font") || corrected.mime === declared) continue

    item.setAttribute("media-type", corrected.mime)
  }
}

export function buildTocOl(entries: NavigationItem[]): Element {
  const children: Element[] = entries.map((entry) => {
    const label = entry.title.replace(/\s+/g, " ").trim()
    const liChildren: Element[] = []

    if (entry.href) {
      liChildren.push(<a href={entry.href}>{label}</a>)
    } else {
      liChildren.push(<span>{label}</span>)
    }

    if (entry.children && entry.children.length > 0) {
      liChildren.push(buildTocOl(entry.children))
    }

    return <li>{liChildren}</li>
  })

  return <ol>{children}</ol>
}

export async function buildNavDocument(
  epub: Epub,
  tocEntries: NavigationItem[],
  landmarks: Landmark[],
): Promise<string> {
  let tocOl: Element

  if (tocEntries.length > 0) {
    tocOl = buildTocOl(tocEntries)
  } else {
    // epub 3 requires a non-empty <ol>, fall back to first spine item
    const spineItems = await epub.getSpineItems()
    const firstHref = spineItems[0]?.href ?? "#"

    tocOl = (
      <ol>
        <li>
          <a href={firstHref}>Start</a>
        </li>
      </ol>
    )
  }

  const tocNav = (
    <nav epub:type="toc">
      <h1>Table of Contents</h1>
      {tocOl}
    </nav>
  )

  const bodyChildren: Element[] = [tocNav]

  const validLandmarks = landmarks.filter((lm) => lm.type)

  if (validLandmarks.length > 0) {
    const lmOl = (
      <ol>
        {validLandmarks.map((lm) => (
          <li>
            <a epub:type={lm.type} href={lm.href}>
              {lm.title || lm.type}
            </a>
          </li>
        ))}
      </ol>
    )

    bodyChildren.push(
      <nav epub:type="landmarks" hidden="">
        {lmOl}
      </nav>,
    )
  }

  const head = [<title>Navigation</title>]

  const navDoc = await epub.createXhtmlDocument(bodyChildren, head)
  return serialize(navDoc)
}

export function setPackageVersion(pkg: Element, version: string): void {
  pkg.setAttribute("version", version)
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
