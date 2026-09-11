import { dirname, join, relative } from "node:path/posix"

import {
  Epub,
  type ManifestItem,
  type ParsedXml,
  type XmlElement,
} from "@storyteller-platform/epub"
import { MediaType } from "@storyteller-platform/media-types"

import { createAudioChapterOverlay } from "./ctc/mediaOverlay.ts"
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
    const id = `storyteller_audio_${n}`
    const href = join(dirname(anchorItem.href), `storyteller-audio-${n}.xhtml`)
    const title = chapter.title ?? `Audio ${n}`
    const headingId = `${id}-s0`
    const overlayId = `${id}_overlay`

    const document = await epub.createXhtmlDocument(
      [
        Epub.createXmlElement("section", { "epub:type": "chapter" }, [
          Epub.createXmlElement("h1", { id: headingId }, [{ "#text": title }]),
        ]),
      ],
      [
        Epub.createXmlElement("title", {}, [{ "#text": title }]),
        Epub.createXmlElement("link", {
          rel: "stylesheet",
          type: "text/css",
          href: relative(dirname(href), READALOUD_STYLESHEET),
        }),
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
      createAudioChapterOverlay(item, headingId, chapter.holes),
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
      value: Epub.formatSmilDuration(
        getChapterDuration(
          chapter.holes.map((hole) => ({
            id: 0,
            chapterId: id,
            audiofile: hole.audiofile,
            start: hole.start,
            end: hole.end,
            state: "unmatched",
          })),
        ),
      ),
    })

    await insertNavEntry(epub, anchorItem, chapter.anchor.position, {
      href,
      title,
    })

    written.push({ id, href, title, anchor: chapter.anchor, holes: chapter.holes })
  }

  return written
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
  const toc = Epub.findXmlDescendantByName(
    "nav",
    nav,
    (node) => Epub.getXmlAttributes(node)["epub:type"] === "toc",
  )
  if (!toc) return
  const list = Epub.findXmlDescendantByName("ol", Epub.getXmlChildren(toc))
  if (!list) return

  const li = Epub.createXmlElement("li", {}, [
    Epub.createXmlElement(
      "a",
      { href: relative(dirname(navItem.href), entry.href) },
      [{ "#text": entry.title }],
    ),
  ])

  const matches = findEntries(list, stem(anchor.href))
  const target = position === "after" ? matches.at(-1) : matches[0]
  if (target) {
    target.children.splice(
      position === "after" ? target.index + 1 : target.index,
      0,
      li,
    )
  } else {
    const spine = await epub.getSpineItems()
    const order = new Map(spine.map((item, index) => [stem(item.href), index]))
    const anchorOrder = order.get(stem(anchor.href)) ?? -1
    const later = findEntries(list, null).find((entry) => {
      const child = entry.children[entry.index]
      const link =
        child && !Epub.isXmlTextNode(child)
          ? Epub.findXmlChildByName("a", Epub.getXmlChildren(child))
          : undefined
      const href = link ? Epub.getXmlAttributes(link)["href"] : undefined
      const entryOrder = href ? order.get(stem(href)) : undefined
      return entryOrder !== undefined && entryOrder > anchorOrder
    })
    if (later) later.children.splice(later.index, 0, li)
    else Epub.getXmlChildren(list).push(li)
  }

  await epub.writeXhtmlItemContents(navItem.id, nav)
}

type NavEntry = { children: ParsedXml; index: number }

function findEntries(
  list: XmlElement<"ol">,
  target: string | null,
): NavEntry[] {
  const found: NavEntry[] = []
  const children = Epub.getXmlChildren(list)
  for (const [index, child] of children.entries()) {
    if (Epub.isXmlTextNode(child) || Epub.getXmlElementName(child) !== "li") {
      continue
    }
    const inner = Epub.getXmlChildren(child)
    const link = Epub.findXmlChildByName("a", inner)
    const href = link ? Epub.getXmlAttributes(link)["href"] : undefined
    if (href && (target === null || stem(href) === target)) {
      found.push({ children, index })
    }
    const nested = Epub.findXmlChildByName("ol", inner)
    if (nested) found.push(...findEntries(nested, target))
  }
  return found
}
