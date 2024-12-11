import { NextRequest, NextResponse } from "next/server"
import { createAuthedApiClient } from "@/authedApiClient"

export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  const client = await createAuthedApiClient()
  await client.logout()
  return NextResponse.redirect(new URL("/login", request.url))
}
