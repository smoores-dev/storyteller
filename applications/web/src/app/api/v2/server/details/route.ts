import { NextResponse } from "next/server"

import { withUser } from "@/auth/auth"
import { getServerDetails } from "@/database/servers"

export const dynamic = "force-dynamic"

export const GET = withUser(async () => {
  const server = await getServerDetails()

  return NextResponse.json(server, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  })
})
