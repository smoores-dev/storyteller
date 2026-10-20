import {
  crengineView,
  resolveChapterXPointer,
  chapterIndexOf,
} from "@storyteller-platform/crengine-xpointer"
import { type EpubReader } from "@storyteller-platform/epub"

import { getAuthorStylesheets } from "@/progress/characterCounts/crengineView.ts"
import { type DomPointReference } from "@/progress/domPoints/domPoint.ts"

export async function domPointReferenceFromCrengineXPointer(
  epub: EpubReader,
  xpointer: string,
): Promise<DomPointReference | null> {
  const spineIndex = chapterIndexOf(xpointer)
  if (spineIndex === null) return null
  const spine = await epub.getSpineItems()
  const spineItem = spine[spineIndex]
  if (!spineItem) return null

  if (spineIndex === -1) return null

  const contentDoc = await epub.readXhtmlItemContents(spineItem.id)

  const stylesheets = await getAuthorStylesheets(
    epub,
    spineItem.href,
    contentDoc,
  )

  const view = crengineView({
    screenWidth: 600,
    styleSheets: stylesheets.map((sheet) => ({ css: sheet, kind: "author" })),
  })

  const domPoint = resolveChapterXPointer(contentDoc, xpointer, {
    view,
    spineIndex,
  })

  if (!domPoint) return null

  return {
    domPoint,
    rootHref: await epub.resolveHref(spineItem.href, undefined, {
      toRoot: true,
    }),
    doc: contentDoc,
  }
}
