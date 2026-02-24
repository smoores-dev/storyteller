import { type BookWithRelations } from "@/database/books"

type CacheBustingOptions = {
  book: BookWithRelations
}

/**
 * creates a custom fetch client that automatically adds cache busting headers
 * based on the book's content timestamp
 */
export function createCacheBustingFetch(options: CacheBustingOptions) {
  const { book } = options

  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url)

    // only add cache busting to our book reading API endpoints
    // maybe not necessary as this is the only place it's used, but just to be safe
    if (url.pathname.includes(`/api/v2/books/${book.uuid}/`)) {
      const contentTimestamp = getContentTimestamp(book)

      url.searchParams.set("v", contentTimestamp)

      const newInit = {
        ...init,
        credentials: "include",
      } satisfies RequestInit

      return window.fetch(url.toString(), newInit)
    }

    // call the original fetch for non-book endpoints
    return window.fetch(input, init)
  }
}

/**
 * get the most recent update timestamp from all content sources
 */
export function getContentTimestamp(book: BookWithRelations): string {
  const timestamps = [
    book.ebook?.updatedAt,
    book.audiobook?.updatedAt,
    book.readaloud?.updatedAt,
  ].filter((timestamp): timestamp is string => Boolean(timestamp))

  if (timestamps.length === 0) {
    return new Date().toISOString()
  }

  const sortedTimestamps = timestamps.sort().reverse()
  return sortedTimestamps[0] || new Date().toISOString()
}

/**
 * creates a fetch client that forces cache refresh for all requests
 */
export function createForceCacheBustingFetch(book: BookWithRelations) {
  return createCacheBustingFetch({ book })
}

export function hasContentChanged(
  book: BookWithRelations,
  lastTimestamp?: string,
): boolean {
  if (!lastTimestamp) return true

  const currentTimestamp = getContentTimestamp(book)
  return currentTimestamp !== lastTimestamp
}

/**
 * gets a cache-busting header value for manual cache refresh
 */
export function getCacheBustHeader(): string {
  return Date.now().toString()
}
