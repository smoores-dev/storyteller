import { NextResponse } from "next/server"

import { fetchEmissionCapabilities } from "@storyteller-platform/ghost-story/emission-client"

import { withHasPermission } from "@/auth/auth"

export const dynamic = "force-dynamic"

const TIMEOUT = 10_000

/**
 * @summary Check that a ghost-story server answers and report what it runs on
 */
export const POST = withHasPermission("bookProcess")(async (request) => {
  const { url, apiKey } = (await request.json()) as {
    url: string
    apiKey?: string | null
  }

  try {
    const capabilities = await fetchEmissionCapabilities(
      { url, apiKey, timeout: TIMEOUT },
      AbortSignal.timeout(TIMEOUT),
    )
    return NextResponse.json(capabilities)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    )
  }
})
