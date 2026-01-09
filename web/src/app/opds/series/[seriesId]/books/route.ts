import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getSeriesByUuid } from "@/database/series"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import { createSeriesAcquisitionFeed } from "@/opds/feed"
import {
  createOPDSResponse,
  getOPDSConfig,
  opdsPaginationOptions,
} from "@/opds/utils"
import type { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{
  seriesId: string
}>

export const GET = withHasPermission<Params>(
  "bookRead",
  OPDS_AUTH_OPTIONS,
)(async (request, context) => {
  const config = await getOPDSConfig()

  if (!config.enabled) {
    return new NextResponse("OPDS is disabled", { status: 404 })
  }

  const { seriesId } = await context.params
  const userId = request.auth.user.id
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10)

  const series = await getSeriesByUuid(seriesId as UUID, userId)

  if (!series) {
    return new NextResponse("Series not found", { status: 404 })
  }

  const feed = await createSeriesAcquisitionFeed(
    { userId },
    series,
    { sortBy: "updatedAt", sortOrder: "desc" },
    opdsPaginationOptions(config.pageSize, page, request.url),
  )

  const xml = feed.toXml({ prettyPrint: true })

  return createOPDSResponse(xml, "acquisition")
})
