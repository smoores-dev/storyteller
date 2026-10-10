import { NextResponse } from "next/server"

import { asMetadataProvider } from "@storyteller-platform/nodekit"

import { nodekitErrorResponse } from "@/app/api/v2/metadata/nodekitErrors"
import { withHasPermission } from "@/auth/auth"
import { getNodeKit } from "@/services/nodekitService"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookRead")(async (request) => {
  const params = request.nextUrl.searchParams
  const provider = asMetadataProvider(params.get("provider"))
  const id = params.get("id")

  if (!provider || !id) {
    return NextResponse.json(
      { message: "provider and id are required" },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(
      await getNodeKit().metadataBook({
        provider,
        id,
        region: params.get("region") ?? undefined,
      }),
    )
  } catch (error) {
    return nodekitErrorResponse(error)
  }
})
