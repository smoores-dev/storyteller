import { Epub } from "@storyteller-platform/epub"

import { type BookWithRelations } from "@/database/books"

export async function readEpub(book: BookWithRelations) {
  if (!book.ebook?.filepath) {
    throw new Error(
      `Cannot read EPUB for book ${book.title} (${book.id}): It has no associated ebook record`,
    )
  }
  return Epub.from(book.ebook.filepath)
}

export async function getFullText(epub: Epub) {
  const spine = await epub.getSpineItems()
  const chapterTexts = await Promise.all(
    spine.map((item) => epub.readXhtmlItemContents(item.id, "text")),
  )
  return chapterTexts.join("\n")
}
