import { relative, dirname } from "node:path/posix"

import { type EpubReader, parse } from "@storyteller-platform/epub"

import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { domPointFromAnchor } from "@/progress/domPoints/fromAnchor.ts"
import { domPointFromCharacterCount } from "@/progress/domPoints/fromChar.ts"
import { domPointReferenceFromCrengineXPointer } from "@/progress/domPoints/fromCrengine.ts"
import { domPointReferenceFromEpubCfi } from "@/progress/domPoints/fromEpubCfi.ts"
import { type UriReference } from "@/progress/uriReference.ts"

export async function domPointReferenceFromXhtmlReferences(
  epub: EpubReader,
  xhtmlReferences: UriReference[],
): Promise<DomPointReference | null> {
  const topXhtmlRef = xhtmlReferences[0]

  if (topXhtmlRef?.fragment.identifier?.kind === "epubcfi") {
    return await domPointReferenceFromEpubCfi(
      epub,
      topXhtmlRef.fragment.identifierString(),
    )
  }

  if (topXhtmlRef?.fragment.identifier?.kind === "crengine") {
    return await domPointReferenceFromCrengineXPointer(
      epub,
      topXhtmlRef.fragment.identifier.path,
    )
  }

  if (!topXhtmlRef?.hrefPathname) {
    return null
  }

  const href = relative(
    dirname(await epub.getRootfile()),
    topXhtmlRef.hrefPathname,
  )
  const contents = await epub.readFileContents(href, undefined, "utf-8")
  const doc = parse(contents, "application/xhtml+xml")

  if (topXhtmlRef.fragment.identifier?.kind === "char") {
    const domPoint = domPointFromCharacterCount(
      doc,
      topXhtmlRef.fragment.identifier.range.offset,
    )
    if (!domPoint) return null

    return {
      rootHref: topXhtmlRef.hrefPathname,
      domPoint,
      doc,
    }
  }

  if (topXhtmlRef.fragment.identifier?.kind === "anchor") {
    const domPoint = domPointFromAnchor(
      doc,
      topXhtmlRef.fragment.identifier.value,
    )
    if (!domPoint) return null

    return {
      rootHref: topXhtmlRef.hrefPathname,
      domPoint,
      doc,
    }
  }

  if (
    !topXhtmlRef.fragment.identifier &&
    !topXhtmlRef.fragment.directive.text.length
  ) {
    const domPoint = domPointFromCharacterCount(doc, 0)
    if (!domPoint) return null

    return {
      rootHref: topXhtmlRef.hrefPathname,
      domPoint,
      doc,
    }
  }

  return null
}
