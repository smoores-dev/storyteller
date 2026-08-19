import { type GetBooksOptions } from "@/database/books"
import { type ShelfFilter, shelfFilterSchema } from "@/shelves"
import { SORTABLE_FIELDS, type SortField } from "@/sort"
import { type UUID } from "@/uuid"

export type ParseBookQueryResult =
  | { ok: true; opts: GetBooksOptions }
  | { ok: false; error: string }

export function parseGetBooksOptions(
  searchParams: URLSearchParams,
): ParseBookQueryResult {
  const opts: GetBooksOptions = {}

  const filterParam = searchParams.get("filter")
  if (filterParam) {
    let parsed: ShelfFilter
    try {
      parsed = JSON.parse(filterParam) as ShelfFilter
    } catch {
      return { ok: false, error: "Invalid filter" }
    }
    if (parsed.type === "condition") {
      parsed = { type: "and", children: [parsed] }
    }
    const validated = shelfFilterSchema.safeParse(parsed)
    if (!validated.success) {
      console.error(validated.error)
      return { ok: false, error: validated.error.message }
    }
    opts.filter = validated.data
  }

  const limitParam = searchParams.get("limit")
  if (limitParam) opts.limit = parseInt(limitParam)

  const offsetParam = searchParams.get("offset")
  if (offsetParam) opts.offset = parseInt(offsetParam)

  const orderByParam = searchParams.get("orderBy")
  if (orderByParam) {
    if ((SORTABLE_FIELDS as readonly string[]).includes(orderByParam)) {
      opts.orderBy = orderByParam as SortField
    } else if (
      orderByParam === "seriesPosition" &&
      searchParams.get("series")
    ) {
      opts.orderBy = "seriesPosition"
    }
  }

  const orderDirectionParam = searchParams.get("orderDirection")
  if (orderDirectionParam) {
    opts.orderDirection = orderDirectionParam as "asc" | "desc"
  }

  const searchParam = searchParams.get("search")
  if (searchParam) opts.search = searchParam

  const collectionParam = searchParams.get("collection")
  if (collectionParam) opts.collection = collectionParam as UUID

  const seriesParam = searchParams.get("series")
  if (seriesParam) opts.series = seriesParam as UUID

  const mediaFilterParam = searchParams.get("mediaFilter")
  if (mediaFilterParam) {
    opts.mediaFilter = mediaFilterParam as "ebook" | "audiobook" | "synced"
  }

  const statusParam = searchParams.get("status")
  if (statusParam) opts.status = statusParam as UUID

  return { ok: true, opts }
}
