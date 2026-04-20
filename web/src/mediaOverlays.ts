import { LRUCache } from "next/dist/server/lib/lru-cache"

import {
  Epub,
  type ParsedXml,
  type XmlElement,
  type XmlNode,
} from "@storyteller-platform/epub"

import { getReadaloudFilepath } from "./database/books"
import { type ReadiumLocator } from "./database/positions"
import { type UUID } from "./uuid"

const cache = new LRUCache<(readonly [string, number, number])[]>(20)

export async function addFragmentToLocator(
  bookUuid: UUID,
  locator: ReadiumLocator,
) {
  const progressions = await getFragmentProgressionBoundsForLocator(
    bookUuid,
    locator,
  )

  if (!progressions) return locator
  const { locations } = locator
  if (!locations) return locator
  const { progression } = locations
  if (progression === undefined) return locator

  let startIndex = 0
  let endIndex = progressions.length - 1
  while (startIndex <= endIndex) {
    const midIndex = Math.floor((startIndex + endIndex) / 2)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const midItem = progressions[midIndex]!
    if (progression < midItem[1]) {
      endIndex = midIndex - 1
      continue
    }
    if (progression >= midItem[2]) {
      startIndex = midIndex + 1
      continue
    }
    return {
      ...locator,
      locations: {
        ...locator.locations,
        fragments: [midItem[0]],
      },
    }
  }

  return locator
}

async function getFragmentProgressionBoundsForLocator(
  bookUuid: UUID,
  locator: ReadiumLocator,
) {
  const readaloudFilepath = await getReadaloudFilepath(bookUuid)
  if (!readaloudFilepath) return null

  const { href } = locator

  const cached = cache.get(`${bookUuid}:${href}`)
  if (cached) return cached

  using readaloud = await Epub.from(readaloudFilepath)

  const manifest = await readaloud.getManifest()
  const item = Object.values(manifest).find((i) => i.href === href)

  if (!item?.mediaOverlay) return null

  const mediaOverlayContents = await readaloud.readItemContents(
    item.mediaOverlay,
    "utf-8",
  )
  const mediaOverlay = Epub.xmlParser.parse(mediaOverlayContents) as ParsedXml

  const pars = Epub.findAllXmlDescendantsByName("par", mediaOverlay)
  const fragments = pars.reduce((acc, par) => {
    const text = Epub.findXmlChildByName("text", Epub.getXmlChildren(par))
    if (!text) return acc
    const attrs = Epub.getXmlAttributes(text)
    const { src } = attrs
    const fragment = src?.split("#")[1]
    if (!fragment) return acc
    return acc.add(fragment)
  }, new Set<string>())

  const chapter = await readaloud.readXhtmlItemContents(item.id, "xhtml")

  const body = Epub.findXmlDescendantByName("body", chapter)
  if (!body) return null

  let pos = 0
  let trailingWhitespace = true
  const positions: [string, number, number][] = []
  descendants(body, (node) => {
    if (Epub.isXmlTextNode(node)) return false

    const attrs = Epub.getXmlAttributes(node)
    // NOTE: This will have to change when we start supporting
    // text fragments
    const id = attrs["id"]
    if (!id) return true
    if (!fragments.has(id)) return true

    let textContent = Epub.getXhtmlTextContent(Epub.getXmlChildren(node))
    if (trailingWhitespace) {
      textContent = textContent.replace(/^\s+/, "")
    } else {
      textContent = textContent.replace(/^\s+/, " ")
    }
    textContent = textContent.replace(/\s+/, " ")

    trailingWhitespace = !!textContent.at(-1)?.match(/\s/)

    positions.push([id, pos, pos + textContent.length])
    pos += textContent.length
    return false
  })

  const progressions = positions.map(
    ([fragment, start, end]) => [fragment, start / pos, end / pos] as const,
  )

  cache.set(`${bookUuid}:${href}`, progressions)

  return progressions
}

function descendants(node: XmlElement, cb: (node: XmlNode) => boolean) {
  for (const child of Epub.getXmlChildren(node)) {
    const descend = cb(child)
    if (descend && !Epub.isXmlTextNode(child)) {
      descendants(child, cb)
    }
  }
}
