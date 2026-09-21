import { NextResponse } from "next/server"

import {
  invalidFilterResponse,
  validateFilter,
} from "@/app/api/v2/shelves/validateFilter"
import { withHasPermission } from "@/auth/auth"
import { type GetShelfBooksOptions, getShelfBooks } from "@/database/shelves"
import { ShelfFilterInvalidError } from "@/shelves"
import { type SortField } from "@/sort"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ uuid: UUID }>

export const GET = withHasPermission<Params>("bookList")(async (
  request,
  context,
) => {
  const user = request.auth.user
  const { uuid } = await context.params

  const limitParam = request.nextUrl.searchParams.get("limit")
  const offsetParam = request.nextUrl.searchParams.get("offset")
  const orderByParam = request.nextUrl.searchParams.get("orderBy")
  const orderDirectionParam = request.nextUrl.searchParams.get("orderDirection")

  const opts: GetShelfBooksOptions = {}

  if (limitParam) {
    opts.limit = parseInt(limitParam)
  }

  if (offsetParam) {
    opts.offset = parseInt(offsetParam)
  }

  if (orderByParam) {
    opts.orderBy = orderByParam as GetShelfBooksOptions["orderBy"]
  }

  if (orderDirectionParam) {
    opts.orderDirection = orderDirectionParam as "asc" | "desc"
  }

  const sortFieldParam = request.nextUrl.searchParams.get("sortField")
  if (sortFieldParam) {
    opts.sortField = sortFieldParam as SortField
  }

  const searchParam = request.nextUrl.searchParams.get("search")
  if (searchParam) {
    opts.search = searchParam
  }

  const filterParam = request.nextUrl.searchParams.get("filter")
  if (filterParam) {
    let raw: unknown
    try {
      raw = JSON.parse(filterParam)
    } catch {
      return invalidFilterResponse([{ kind: "unparseable" }])
    }
    const validated = validateFilter(raw)
    if (!validated.ok) return validated.response
    opts.filter = validated.filter
  }

  try {
    const books = await getShelfBooks(uuid, user.id, opts)
    return NextResponse.json(books)
  } catch (error) {
    if (error instanceof ShelfFilterInvalidError) {
      return invalidFilterResponse(error.issues)
    }
    throw error
  }
})
