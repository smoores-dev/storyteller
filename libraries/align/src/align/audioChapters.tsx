/** @jsxImportSource @storyteller-platform/epub */

import { dirname, join, relative } from "node:path/posix"

import {
  type Element,
  Epub,
  findXmlChildByName,
  findXmlDescendantByName,
  getXhtmlBody,
  insert,
  isElement,
  type ManifestItem,
} from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

import { createAudioChapterOverlay } from "./ctc/mediaOverlay.tsx"
import { getChapterDuration } from "./getSentenceRanges.ts"
import { type AudioChapter, type Hole, type HoleAnchor } from "./holes.ts"

export const READALOUD_STYLESHEET = "Styles/storyteller-readaloud.css"

export type WrittenAudioChapter = {
  id: string
  href: string
  title: string
  anchor: HoleAnchor
  holes: Hole[]
}

function stem(href: string): string {
  const path = href.split("#")[0] ?? href
  const name = path.split("/").pop() ?? path
  return name.replace(/\.[^.]+$/, "").toLowerCase()
}

type PositionalTitles = Record<"before" | "after", (title: string) => string>

const ENGLISH_POSITIONAL: PositionalTitles = {
  before: (title) => `Before ${title}`,
  after: (title) => `After ${title}`,
}

const POSITIONAL_TITLES: Record<string, PositionalTitles> = {
  en: ENGLISH_POSITIONAL,
  nl: {
    before: (title) => `Voor ${title}`,
    after: (title) => `Na ${title}`,
  },
  de: {
    before: (title) => `Vor ${title}`,
    after: (title) => `Nach ${title}`,
  },
  fr: {
    before: (title) => `Avant ${title}`,
    after: (title) => `Après ${title}`,
  },
  es: {
    before: (title) => `Antes de ${title}`,
    after: (title) => `Después de ${title}`,
  },
  it: {
    before: (title) => `Prima di ${title}`,
    after: (title) => `Dopo ${title}`,
  },
  pt: {
    before: (title) => `Antes de ${title}`,
    after: (title) => `Depois de ${title}`,
  },
}

function positionalTitle(
  chapter: AudioChapter,
  locale: Intl.Locale,
): string | null {
  if (chapter.anchorTitle === null) return null
  const titles = POSITIONAL_TITLES[locale.language] ?? ENGLISH_POSITIONAL
  return titles[chapter.anchor.position](chapter.anchorTitle)
}

async function textRefId(
  epub: Epub,
  item: ManifestItem,
): Promise<string | null> {
  const xhtml = await epub.readXhtmlItemContents(item.id)
  const body = getXhtmlBody(xhtml)
  const first = Array.from(body.childNodes).find(isElement)
  if (!first) return null
  const existing = first.getAttribute("id")
  if (existing) return existing
  const id = `${item.id}-s0`
  first.setAttribute("id", id)
  await epub.writeXhtmlItemContents(item.id, xhtml)
  return id
}

export async function writeAudioChapters(
  epub: Epub,
  chapters: AudioChapter[],
  locale: Intl.Locale,
): Promise<WrittenAudioChapter[]> {
  const written: WrittenAudioChapter[] = []
  const lastInserted = new Map<string, string>()

  for (const chapter of chapters) {
    const manifest = await epub.getManifest()
    const anchorItem = manifest[chapter.anchor.chapterId]
    if (!anchorItem) continue

    const n = written.length + 1
    const fallbackTitle =
      chapter.existing?.title ??
      positionalTitle(chapter, locale) ??
      `Audio ${n}`
    const existingItem = chapter.existing
      ? (manifest[chapter.existing.id] ?? null)
      : null
    if (existingItem) {
      const attached = await attachAudioChapter(
        epub,
        existingItem,
        chapter,
        n,
        chapter.title ?? fallbackTitle,
      )
      if (attached) {
        written.push(attached)
        continue
      }
    }

    const id = `storyteller_audio_${n}`
    const href = join(dirname(anchorItem.href), `storyteller-audio-${n}.xhtml`)
    const title = chapter.title ?? fallbackTitle
    const headingId = `${id}-s0`
    const overlayId = `${id}_overlay`

    const document = await epub.createXhtmlDocument(
      [
        <section epub:type="chapter">
          <h1 id={headingId}>{title}</h1>
        </section>,
      ],
      [
        <title>{title}</title>,
        <link
          rel="stylesheet"
          type="text/css"
          href={relative(dirname(href), READALOUD_STYLESHEET)}
        />,
      ],
      locale,
    )

    await epub.addManifestItem(
      { id, href, mediaType: MediaType.XHTML.mime, mediaOverlay: overlayId },
      document,
      "xml",
    )

    const item: ManifestItem = { id, href, mediaType: MediaType.XHTML.mime }
    await epub.addManifestItem(
      {
        id: overlayId,
        href: `MediaOverlays/storyteller-audio-${n}.smil`,
        mediaType: MediaType.SMIL.mime,
      },
      epub.createXmlDocument(
        createAudioChapterOverlay(item, headingId, chapter.holes),
      ),
      "xml",
    )

    const spine = await epub.getSpineItems()
    const key = `${chapter.anchor.chapterId}:${chapter.anchor.position}`
    const neighbour = lastInserted.get(key) ?? chapter.anchor.chapterId
    const neighbourIndex = spine.findIndex((entry) => entry.id === neighbour)
    const index =
      neighbourIndex === -1
        ? undefined
        : chapter.anchor.position === "after" || lastInserted.has(key)
          ? neighbourIndex + 1
          : neighbourIndex
    await epub.addSpineItem(id, index)
    lastInserted.set(key, id)

    await epub.addMetadata({
      type: "meta",
      properties: { property: "media:duration", refines: `#${overlayId}` },
      value: Epub.formatSmilDuration(getChapterDuration(chapter.holes)),
    })

    await insertNavEntry(epub, anchorItem, chapter.anchor.position, {
      href,
      title,
    })

    written.push({
      id,
      href,
      title,
      anchor: chapter.anchor,
      holes: chapter.holes,
    })
  }

  return written
}

async function attachAudioChapter(
  epub: Epub,
  item: ManifestItem,
  chapter: AudioChapter,
  n: number,
  title: string,
): Promise<WrittenAudioChapter | null> {
  const fragment = await textRefId(epub, item)
  if (!fragment) return null

  const overlayId = `${item.id}_overlay`
  await epub.addManifestItem(
    {
      id: overlayId,
      href: `MediaOverlays/storyteller-audio-${n}.smil`,
      mediaType: MediaType.SMIL.mime,
    },
    epub.createXmlDocument(
      createAudioChapterOverlay(item, fragment, chapter.holes),
    ),
    "xml",
  )

  await epub.updateManifestItem(item.id, {
    href: item.href,
    mediaType: item.mediaType,
    fallback: item.fallback,
    properties: item.properties,
    mediaOverlay: overlayId,
  })

  await epub.addMetadata({
    type: "meta",
    properties: { property: "media:duration", refines: `#${overlayId}` },
    value: Epub.formatSmilDuration(getChapterDuration(chapter.holes)),
  })

  return {
    id: item.id,
    href: item.href,
    title,
    anchor: chapter.anchor,
    holes: chapter.holes,
  }
}

async function insertNavEntry(
  epub: Epub,
  anchor: ManifestItem,
  position: "before" | "after",
  entry: { href: string; title: string },
) {
  const manifest = await epub.getManifest()
  const navItem = Object.values(manifest).find((item) =>
    item.properties?.includes("nav"),
  )
  if (!navItem) return

  const nav = await epub.readXhtmlItemContents(navItem.id)
  const navHtml = nav.documentElement
  if (!navHtml) return

  const toc = findXmlDescendantByName(
    "nav",
    navHtml,
    (node) => node.getAttribute("epub:type") === "toc",
  )
  if (!toc) return
  const list = findXmlDescendantByName("ol", toc)
  if (!list) return

  const li = (
    <li>
      <a href={relative(dirname(navItem.href), entry.href)}>{entry.title}</a>
    </li>
  )

  const matches = findEntries(list, stem(anchor.href))
  const target = position === "after" ? matches.at(-1) : matches[0]
  if (target) {
    insert(
      target.parentElement ?? list,
      li,
      position === "after" ? target.nextSibling : target,
    )
  } else {
    const spine = await epub.getSpineItems()
    const order = new Map(spine.map((item, index) => [stem(item.href), index]))
    const anchorOrder = order.get(stem(anchor.href)) ?? -1
    const later = findEntries(list, null).find((entry) => {
      const href = findXmlChildByName("a", entry)?.getAttribute("href")
      const entryOrder = href ? order.get(stem(href)) : undefined
      return entryOrder !== undefined && entryOrder > anchorOrder
    })
    if (later) insert(later.parentElement ?? list, li, later.nextSibling)
    else insert(list, li)
  }

  await epub.writeXhtmlItemContents(navItem.id, nav)
}

function findEntries(list: Element, target: string | null): Element[] {
  const found: Element[] = []
  for (const child of Array.from(list.children)) {
    if (child.nodeName !== "li") {
      continue
    }
    const link = findXmlChildByName("a", child)
    const href = link?.getAttribute("href")
    if (href && (target === null || stem(href) === target)) {
      found.push(child)
    }
    const nested = findXmlChildByName("ol", child)
    if (nested) found.push(...findEntries(nested, target))
  }
  return found
}
