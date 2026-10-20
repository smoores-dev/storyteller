import { relative, dirname } from "node:path/posix"

import {
  findXmlDescendantByNameNS,
  NS,
  type EpubReader,
} from "@storyteller-platform/epub"
import { EpubCfiBuilder } from "@storyteller-platform/epubcfi"
import { UriFragment } from "@storyteller-platform/uri-fragment"

import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { UriReference } from "@/progress/uriReference.ts"

export async function domPointReferenceToEpubCfiReference(
  epub: EpubReader,
  domPointRef: DomPointReference,
): Promise<UriReference | null> {
  const { domPoint, rootHref } = domPointRef
  const href = relative(dirname(await epub.getRootfile()), rootHref)

  const builder = new EpubCfiBuilder()

  const manifest = await epub.getManifest()
  const manifestItem = Object.values(manifest).find(
    (item) => item.href === href,
  )
  if (!manifestItem) return null

  const packageDocument = await epub.getPackageDocument()

  const itemref = findXmlDescendantByNameNS(
    NS.opf,
    "itemref",
    packageDocument,
    (itemref) => itemref.getAttribute("idref") === manifestItem.id,
  )
  if (!itemref) return null

  builder.appendLocalPathTo(itemref)

  builder.appendTerminalDomPosition(domPoint.node, domPoint.offset)

  const cfi = builder.toString()

  const fragment = new UriFragment(cfi)
  return new UriReference("/", fragment)
}
