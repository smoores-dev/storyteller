export const BOOK_COLLECTION_ID = "book-collection"
export const BOOK_DETAIL_PANEL_ID = "book-detail-panel"

export function bookItemDomId(uuid: string): string {
  return `book-item-${uuid}`
}

export type BookNavModel = "commit" | "preview"
