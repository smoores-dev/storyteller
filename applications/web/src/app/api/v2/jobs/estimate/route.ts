import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import type { UUID } from "@/uuid"
import type { RestartMode } from "@/work/distributor"
import { getEstimate } from "@/work/estimate"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookProcess")(async (request) => {
  const params = request.nextUrl.searchParams

  const bookUuid = params.get("bookUuid") as UUID | null
  const engine = params.get("engine")
  const whisperModel = params.get("whisperModel") || null
  const restart = (params.get("restart") || false) as RestartMode

  if (!bookUuid || !engine) {
    return NextResponse.json(
      { error: "bookUuid and engine are required" },
      { status: 400 },
    )
  }

  const result = await getEstimate(bookUuid, {
    engine,
    whisperModel,
    restart,
  })

  return NextResponse.json(result)
})
