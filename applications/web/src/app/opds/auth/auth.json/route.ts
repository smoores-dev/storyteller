import { NextResponse } from "next/server"

import { OPDS_AUTHENTICATION_JSON } from "@storyteller-platform/opds"

import { createOPDSAuthenticationDocument } from "@/opds/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const authDocument = await createOPDSAuthenticationDocument()

  return NextResponse.json(authDocument, {
    headers: {
      "Content-Type": OPDS_AUTHENTICATION_JSON,
      "Cache-Control": "public, max-age=3600",
    },
  })
}
