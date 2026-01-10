import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getBooks } from "@/database/books"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import { createBooksFeed } from "@/opds/feed"
import { createOPDSResponse, getOPDSConfig } from "@/opds/utils"

export const dynamic = "force-dynamic"

export const GET = withHasPermission<Promise<{ search: string }>>(
  "bookRead",
  OPDS_AUTH_OPTIONS,
)(async (request) => {
  const config = await getOPDSConfig()

  if (!config.enabled) {
    return new NextResponse("OPDS is disabled", { status: 404 })
  }

  const search = request.nextUrl.searchParams.get("search")

  // TODO: quite inefficient, replace with sqlite search at some point
  const allBooks = await getBooks(null, request.auth.user.id)
  const books = allBooks.filter((book) =>
    book.title.toLowerCase().includes(search?.toLowerCase() ?? ""),
  )

  const feed = createBooksFeed(books, {
    title: "Search Results",
    feedTitle: `Search Results for ${search}`,
    feedId: "search",
  })

  const xml = feed.toXml({ prettyPrint: true })

  return createOPDSResponse(xml, "acquisition")
})
