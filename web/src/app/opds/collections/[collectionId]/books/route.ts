import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getCollection } from "@/database/collections"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import { createCollectionAcquisitionFeed } from "@/opds/feed"
import {
  createOPDSResponse,
  getOPDSConfig,
  opdsPaginationOptions,
} from "@/opds/utils"
import type { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{
  collectionId: string
}>

export const GET = withHasPermission<Params>(
  "bookRead",
  OPDS_AUTH_OPTIONS,
)(async (request, context) => {
  const config = await getOPDSConfig()

  if (!config.enabled) {
    return new NextResponse("OPDS is disabled", { status: 404 })
  }

  const { collectionId } = await context.params
  const userId = request.auth.user.id
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10)

  try {
    const collection = await getCollection(collectionId as UUID, userId)

    const feed = await createCollectionAcquisitionFeed(
      { userId },
      collection,
      opdsPaginationOptions(config.pageSize, page, request.url),
    )

    const xml = feed.toXml({ prettyPrint: true })

    return createOPDSResponse(xml, "acquisition")
  } catch {
    return new NextResponse("Collection not found", { status: 404 })
  }
})
