import { getUserCount } from "@/database/users"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const count = await getUserCount()
  if (count > 0) {
    return new NextResponse(null, { status: 403 })
  }
  return new Response(null, { status: 204 })
}
