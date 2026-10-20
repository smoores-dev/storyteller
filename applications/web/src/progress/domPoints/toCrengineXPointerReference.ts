import { relative, dirname } from "node:path/posix"

import {
  buildChapterXPointer,
  crengineView,
} from "@storyteller-platform/crengine-xpointer"
import { type EpubReader } from "@storyteller-platform/epub"
import { UriFragment } from "@storyteller-platform/uri-fragment"

import { getAuthorStylesheets } from "@/progress/characterCounts/crengineView.ts"
import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"
import { UriReference } from "@/progress/uriReference.ts"

export async function domPointReferenceToCrengineXPointerReference(
  epub: EpubReader,
  domPointRef: DomPointReference,
): Promise<UriReference | null> {
  const { domPoint, rootHref, doc } = domPointRef

  const href = relative(dirname(await epub.getRootfile()), rootHref)

  const spine = await epub.getSpineItems()

  const spineIndex = spine.findIndex((item) => item.href === href)
  if (spineIndex === -1) return null

  const stylesheets = await getAuthorStylesheets(epub, href, doc)

  const view = crengineView({
    screenWidth: 600,
    styleSheets: stylesheets.map((css) => ({ css, kind: "author" })),
  })

  const xpointer = buildChapterXPointer(doc, domPoint, {
    view,
    spineIndex,
  })

  const fragment = new UriFragment()
  fragment.setIdentifier("crengine", { path: xpointer })

  return new UriReference("/", fragment)
}
