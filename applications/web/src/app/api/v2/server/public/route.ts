import { NextResponse } from "next/server"

import { getPublicServerInfo } from "@/database/servers"

export const dynamic = "force-dynamic"

export const GET = async () => {
  const server = await getPublicServerInfo()

  return NextResponse.json(server, {
    headers: {
      "Cache-Control": "public, max-age=60",
    },
  })
}
