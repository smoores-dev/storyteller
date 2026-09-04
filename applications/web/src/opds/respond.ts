import { type NextRequest, NextResponse } from "next/server"

import { type Feed, OPDS_JSON, toAtomXml } from "@storyteller-platform/opds"

import { withHasPermission } from "@/auth/auth"
import type { OpdsFormat } from "@/database/settingsTypes"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import { type OpdsVersion } from "@/opds/builders"
import { createOPDSResponse, getOPDSConfig } from "@/opds/utils"
import type { UUID } from "@/uuid"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const

export const parseVersion = (raw: string | undefined): OpdsVersion =>
  raw === "v2" ? "v2" : "v1"

export const respond = (version: OpdsVersion, feed: Feed): Response => {
  if (version === "v2") {
    return new NextResponse(JSON.stringify(feed.serialize()), {
      headers: { "Content-Type": OPDS_JSON, ...CORS },
    })
  }
  const kind = feed.publications ? "acquisition" : "navigation"
  return createOPDSResponse(toAtomXml(feed, { pretty: true }), kind)
}

export const opdsOptions = (_request: NextRequest) =>
  new NextResponse(null, { headers: CORS })

interface OpdsConfig {
  enabled: boolean | null
  pageSize: number | null
  format: OpdsFormat
}

interface BuildArgs<P> {
  version: OpdsVersion
  userId: UUID
  params: P
  config: OpdsConfig
  page: number
  searchParams: URLSearchParams
}

export const handleOpds = <P extends Record<string, string>>(
  build: (args: BuildArgs<P>) => Promise<Feed | Response>,
) =>
  withHasPermission<Promise<P>>(
    "bookRead",
    OPDS_AUTH_OPTIONS,
  )(async (request, context) => {
    const config = await getOPDSConfig()
    if (!config.enabled) {
      return new NextResponse("OPDS is disabled", { status: 404 })
    }

    const params = await context.params
    const version = parseVersion(params["version"])
    const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10)

    const result = await build({
      version,
      userId: request.auth.user.id,
      params,
      config,
      page,
      searchParams: request.nextUrl.searchParams,
    })

    return result instanceof Response ? result : respond(version, result)
  })
