import assert from "node:assert"
import { relative, dirname } from "node:path/posix"

import { type EpubReader, parse } from "@storyteller-platform/epub"

import { type ReadiumLocator } from "@/database/positions.ts"
import { characterReferenceFromAnchor } from "@/progress/characterCounts/fromAnchor.ts"
import { characterCountFromNode } from "@/progress/characterCounts/fromNode.ts"
import { locatorProgressionToNode } from "@/progress/locators/toNode.ts"

export async function locatorToCharacterCount(
  epub: EpubReader,
  locator: ReadiumLocator,
  strategy: "progression" | "fragments" = "progression",
): Promise<number | null> {
  const { href: resource, locations } = locator
  if (strategy === "fragments") {
    const fragment = locations?.fragments?.[0]
    if (fragment) {
      const charRef = await characterReferenceFromAnchor(
        epub,
        resource,
        fragment,
      )
      if (charRef) {
        assert(charRef.fragment.identifier?.kind === "char")

        return charRef.fragment.identifier.range.offset
      }
    }
  }
  const progression = locations?.progression
  if (progression === undefined) return null

  const href = relative(dirname(await epub.getRootfile()), resource)
  const contents = await epub.readFileContents(href, undefined, "utf-8")
  const doc = parse(contents, "application/xhtml+xml")

  const position = locatorProgressionToNode(doc, progression)
  if (!position) return null

  const chars = characterCountFromNode(doc, position.node, position.offset)

  return chars
}
