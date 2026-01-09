import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getTagByUuid } from "@/database/tags"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import { createTagAcquisitionFeed } from "@/opds/feed"
import {
  createOPDSResponse,
  getOPDSConfig,
  opdsPaginationOptions,
} from "@/opds/utils"
import type { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{
  tagId: string
}>

export const GET = withHasPermission<Params>(
  "bookRead",
  OPDS_AUTH_OPTIONS,
)(async (request, context) => {
  const config = await getOPDSConfig()

  if (!config.enabled) {
    return new NextResponse("OPDS is disabled", { status: 404 })
  }

  const { tagId } = await context.params
  const userId = request.auth.user.id
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10)

  const tag = await getTagByUuid(tagId as UUID, userId)

  if (!tag) {
    return new NextResponse("Tag not found", { status: 404 })
  }

  const feed = await createTagAcquisitionFeed(
    { userId },
    tag,
    opdsPaginationOptions(config.pageSize, page, request.url),
  )

  const xml = feed.toXml({ prettyPrint: true })

  return createOPDSResponse(xml, "acquisition")
})
