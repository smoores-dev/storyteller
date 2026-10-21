import assert from "node:assert"
import { relative, dirname } from "node:path/posix"

import { type EpubReader, parse } from "@storyteller-platform/epub"

import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { domPointFromCharacterCount } from "@/progress/domPoints/fromChar.ts"
import { domPointReferenceToCharacterReference } from "@/progress/domPoints/toCharacterReference.ts"

export async function convertEpubDomPointReference(
  epubA: EpubReader,
  epubB: EpubReader,
  domPointRef: DomPointReference,
): Promise<DomPointReference | null> {
  const charRef = domPointReferenceToCharacterReference(domPointRef)

  if (!charRef) return null

  assert(charRef.fragment.identifier?.kind === "char")

  const href = relative(
    dirname(await epubA.getRootfile()),
    domPointRef.rootHref,
  )
  let contents!: string
  try {
    contents = await epubB.readFileContents(href, undefined, "utf-8")
  } catch {
    // If EPUB B doesn't have the href from EPUB A,
    // just bail and don't try to convert the domPoint
    return null
  }
  const doc = parse(contents, "application/xhtml+xml")

  const domPoint = domPointFromCharacterCount(
    doc,
    charRef.fragment.identifier.range.offset,
  )
  if (!domPoint) return null

  return {
    domPoint,
    doc,
    rootHref: await epubB.resolveHref(href, undefined, { toRoot: true }),
  }
}
