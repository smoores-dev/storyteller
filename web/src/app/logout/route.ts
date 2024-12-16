import { NextResponse } from "next/server"
import { createAuthedApiClient } from "@/authedApiClient"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"
export async function GET() {
  const client = await createAuthedApiClient()
  await client.logout()

  const requestOrigin = (await headers()).get("Origin")

  if (!requestOrigin) {
    return NextResponse.json({ message: "Logged out" })
  }

  return NextResponse.redirect(new URL("/login", requestOrigin))
}
