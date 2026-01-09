import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import { createRootCatalog } from "@/opds/feed"
import { createOPDSResponse, getOPDSConfig } from "@/opds/utils"

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
  const feed = await createRootCatalog({ userId })

  const xml = feed.toXml({ prettyPrint: true })

  return createOPDSResponse(xml, "navigation")
})
