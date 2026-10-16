import { downloadableAsset } from "@/bookDownloads"
import { type BookWithRelations } from "@/database/books"
import { type KindleAddress } from "@/database/userPreferencesTypes"

export const KINDLE_MAX_BOOKS = 25
export const KINDLE_MAX_BYTES = 25_000_000

export type KindleRefusal = "no-ebook" | "too-many" | "too-large"

export function defaultKindleAddress(
  addresses: KindleAddress[],
): KindleAddress | undefined {
  return addresses.find((address) => address.default) ?? addresses[0]
}

export function kindleBooks<T extends Pick<BookWithRelations, "ebook">>(
  books: T[],
) {
  return books.filter((book) => downloadableAsset(book, "ebook"))
}

export function kindleRefusal(
  books: Pick<BookWithRelations, "ebook">[],
): KindleRefusal | null {
  const sendable = kindleBooks(books)

  if (sendable.length === 0) {
    return "no-ebook"
  }

  if (sendable.length > KINDLE_MAX_BOOKS) {
    return "too-many"
  }

  const bytes = sendable.reduce(
    (total, book) => total + (book.ebook?.fileSize ?? 0),
    0,
  )
  if (bytes > KINDLE_MAX_BYTES) {
    return "too-large"
  }

  return null
}
