import { NextResponse } from "next/server"

import { OPENSEARCH_XML } from "@storyteller-platform/opds"

import { withHasPermission } from "@/auth/auth"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import { createOpenSearchDescription } from "@/opds/builders"
import { getOPDSConfig } from "@/opds/utils"

export const dynamic = "force-dynamic"

export const GET = withHasPermission(
  "bookRead",
  OPDS_AUTH_OPTIONS,
)(async (_request) => {
  const config = await getOPDSConfig()

  if (!config.enabled) {
    return new NextResponse("OPDS is disabled", { status: 404 })
  }

  return new NextResponse(createOpenSearchDescription(), {
    headers: {
      "Content-Type": OPENSEARCH_XML,
    },
  })
})
