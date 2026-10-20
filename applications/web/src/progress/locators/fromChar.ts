import { relative, dirname } from "node:path/posix"

import { LRUCache } from "lru-cache"

import { type EpubReader, parse } from "@storyteller-platform/epub"

import { type ReadiumLocator } from "@/database/positions.ts"
import { countAllDocumentCharacters } from "@/progress/characterCounts/countAllChars.ts"
import { characterCountFromNode } from "@/progress/characterCounts/fromNode.ts"
import { characterCountToNode } from "@/progress/characterCounts/toNode.ts"
import { locatorCssSelectorFromNode } from "@/progress/locators/fromNode.ts"
import { type getAvailableAsset } from "@/progress/references.ts"

export async function locatorFromCharacterCount(
  asset: NonNullable<
    ReturnType<typeof getAvailableAsset<"ebook" | "readaloud">>
  >,
  epub: EpubReader,
  resource: string,
  chars: number,
): Promise<ReadiumLocator | null> {
  const href = relative(dirname(await epub.getRootfile()), resource)
  const contents = await epub.readFileContents(href, undefined, "utf-8")
  const doc = parse(contents, "application/xhtml+xml")

  const position = characterCountToNode(doc, chars)
  if (!position) return null

  const cssSelector = locatorCssSelectorFromNode(doc, position.node)
  if (cssSelector === null) return null

  const totalChars = countAllDocumentCharacters(doc)
  const charProgress =
    characterCountFromNode(doc, position.node, position.offset) ?? totalChars

  const progression = charProgress / totalChars
  const totalProgression = await getTotalProgression(
    asset,
    epub,
    href,
    charProgress,
  )

  return {
    href: resource,
    type: "application/xhtml+xml",
    locations: {
      progression,
      totalProgression,
      cssSelector,
    },
  }
}

type XhtmlCharCounts = [string, number][]

declare global {
  var epubXhtmlCharCountCache: LRUCache<string, XhtmlCharCounts>
}

// oxlint-disable-next-line typescript/no-unnecessary-condition
globalThis.epubXhtmlCharCountCache ??= new LRUCache({ max: 2_500 })

async function getXhtmlCharCounts(
  asset: NonNullable<
    ReturnType<typeof getAvailableAsset<"ebook" | "readaloud">>
  >,
  epub: EpubReader,
) {
  const cacheKey = `${asset.filepath}${asset.fingerprint}`
  const cached = globalThis.epubXhtmlCharCountCache.get(cacheKey)

  if (cached) return cached

  const spine = await epub.getSpineItems()

  const result: XhtmlCharCounts = []

  for (const item of spine) {
    const doc = await epub.readXhtmlItemContents(item.id)

    result.push([item.href, countAllDocumentCharacters(doc)])
  }

  globalThis.epubXhtmlCharCountCache.set(cacheKey, result)
  return result
}

async function getTotalProgression(
  asset: NonNullable<
    ReturnType<typeof getAvailableAsset<"ebook" | "readaloud">>
  >,
  epub: EpubReader,
  href: string,
  charProgress: number,
): Promise<number> {
  const charCounts = await getXhtmlCharCounts(asset, epub)

  let totalProgressChars = 0
  let totalChars = 0

  let foundCurrentHref = false
  for (const [itemHref, docChars] of charCounts) {
    if (href === itemHref) {
      totalProgressChars += charProgress
      foundCurrentHref = true
    }

    totalChars += docChars
    if (!foundCurrentHref) {
      totalProgressChars += docChars
    }
  }

  return totalProgressChars / totalChars
}
