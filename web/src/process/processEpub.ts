import { type Epub } from "@storyteller-platform/epub"

export async function getFullText(epub: Epub) {
  const spine = await epub.getSpineItems()
  const chapterTexts = await Promise.all(
    spine.map((item) => epub.readXhtmlItemContents(item.id, "text")),
  )
  return chapterTexts.join("\n")
}
