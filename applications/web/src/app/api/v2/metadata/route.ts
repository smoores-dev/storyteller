import { NextResponse } from "next/server"

import { asMetadataProvider } from "@storyteller-platform/nodekit"

import { withHasPermission } from "@/auth/auth"
import { getNodeKit } from "@/services/nodekitService"

import { nodekitErrorResponse } from "./nodekitErrors"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookRead")(async (request) => {
  const params = request.nextUrl.searchParams

  const query = {
    title: params.get("title") ?? undefined,
    author: params.get("author") ?? undefined,
    query: params.get("query") ?? undefined,
    region: params.get("region") ?? undefined,
    provider: asMetadataProvider(params.get("provider")),
  }

  if (!query.title && !query.author && !query.query) {
    return NextResponse.json(
      { message: "At least one of title, author, or query is required" },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(await getNodeKit().metadataSearch(query))
  } catch (error) {
    return nodekitErrorResponse(error)
  }
})
