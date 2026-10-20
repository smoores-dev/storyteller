import {
  type EpubReader,
  type Document,
  findXmlDescendantByName,
} from "@storyteller-platform/epub"

import { logger } from "@/logging.ts"

export async function getAuthorStylesheets(
  epub: EpubReader,
  docHref: string,
  doc: Document,
): Promise<string[]> {
  const html = doc.documentElement
  if (!html) return []
  const head = findXmlDescendantByName("head", html)
  if (!head) return []

  // Note: this doesn't filter on disabled or media
  // queries, could be expanded
  const styleLinks = head.children.filter(
    (element) =>
      element.nodeName === "link" &&
      element.getAttribute("rel") === "stylesheet",
  )

  const stylesheets: string[] = []
  for (const link of styleLinks) {
    const href = link.getAttribute("href")
    if (!href) continue

    try {
      const stylesheet = await epub.readFileContents(href, docHref, "utf-8")
      stylesheets.push(stylesheet)
    } catch (e) {
      // Just move on if we fail to load a stylesheet
      logger.debug({
        msg: `Failed to load stylesheet from EPUB when building crengine view: ${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  return stylesheets
}
