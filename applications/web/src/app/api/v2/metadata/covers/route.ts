import { NextResponse } from "next/server"

import { asCoverProvider } from "@storyteller-platform/nodekit"

import { nodekitErrorResponse } from "@/app/api/v2/metadata/nodekitErrors"
import { withHasPermission } from "@/auth/auth"
import { getNodeKit } from "@/services/nodekitService"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookRead")(async (request) => {
  const params = request.nextUrl.searchParams

  const query = {
    title: params.get("title") ?? undefined,
    author: params.get("author") ?? undefined,
    query: params.get("query") ?? undefined,
    provider: asCoverProvider(params.get("provider")),
  }

  if (!query.title && !query.query) {
    return NextResponse.json(
      { message: "At least one of title or query is required" },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(await getNodeKit().coverSearch(query))
  } catch (error) {
    return nodekitErrorResponse(error)
  }
})
