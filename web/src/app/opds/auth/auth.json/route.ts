import { NextResponse } from "next/server"

import { createOPDSAuthenticationDocument } from "@/opds/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const authDocument = await createOPDSAuthenticationDocument()

  return NextResponse.json(authDocument, {
    headers: {
      "Content-Type": "application/opds-authentication+json",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
