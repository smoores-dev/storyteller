import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import { createAllBooksAcquisitionFeed } from "@/opds/feed"
import {
  createOPDSResponse,
  getOPDSConfig,
  opdsPaginationOptions,
} from "@/opds/utils"

export const dynamic = "force-dynamic"

export const GET = withHasPermission(
  "bookRead",
  OPDS_AUTH_OPTIONS,
)(async (request) => {
  const config = await getOPDSConfig()

  if (!config.enabled) {
    return new NextResponse("OPDS is disabled", { status: 404 })
  }

  const userId = request.auth.user.id
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10)
  const formatParam = request.nextUrl.searchParams.get("format") as
    | "ebook"
    | "audiobook"
    | "readaloud"
    | null

  const feed = await createAllBooksAcquisitionFeed(
    { userId },
    formatParam ?? undefined,
    opdsPaginationOptions(config.pageSize, page, request.url),
  )

  const xml = feed.toXml({ prettyPrint: true })

  return createOPDSResponse(xml, "acquisition")
})
