import { type EpubReader } from "@storyteller-platform/epub"
import { EpubCfiResolver, EpubCfiParser } from "@storyteller-platform/epubcfi"

import { logger } from "@/logging.ts"
import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"

export async function domPointReferenceFromEpubCfi(
  epub: EpubReader,
  epubCfi: string,
): Promise<DomPointReference | null> {
  const rootfile = await epub.getRootfile()
  const containerDoc = await epub.getPackageDocument()
  const cfiRoot = EpubCfiParser.parse(epubCfi)

  const resolver = new EpubCfiResolver(cfiRoot)

  const indirectionResult = resolver.continueResolving(
    containerDoc,
    new URL(rootfile, "publication:///"),
  )

  if (!indirectionResult) return null

  const idref = indirectionResult.element.getAttribute("idref")
  if (!idref) return null

  const manifest = await epub.getManifest()
  const item = manifest[idref]
  if (!item) return null

  const contentDoc = await epub.readXhtmlItemContents(idref)

  resolver.continueResolving(contentDoc, new URL(item.href, "publication:///"))
  const resolvedTarget = resolver.getResolvedTarget()

  if (resolvedTarget.hasErrors()) {
    logger.warn({
      msg: `EPUB CFI resolution encountered errors`,
      errors: resolvedTarget.getResolverErrors(),
    })
  }

  const node = resolvedTarget.parentPath?.container
  const offset = resolvedTarget.parentPath?.offset

  if (node === undefined) return null

  const domPoint = { node, offset: offset ?? 0 }
  return {
    domPoint,
    rootHref: await epub.resolveHref(item.href, undefined, { toRoot: true }),
    doc: contentDoc,
  }
}
