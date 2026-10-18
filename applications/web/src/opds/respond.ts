import { type NextRequest, NextResponse } from "next/server"

import { type Feed, OPDS_JSON, toAtomXml } from "@storyteller-platform/opds"

import { withHasPermission } from "@/auth/auth"
import { OPDS_AUTH_OPTIONS } from "@/opds/auth"
import {
  type BuildContext,
  type OpdsVersion,
  parseVersion,
} from "@/opds/builders"
import { createOPDSResponse, getOPDSConfig } from "@/opds/utils"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const

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

const notFound = () => new NextResponse("Not found", { status: 404 })

export const handleOpds = (
  build: (
    ctx: BuildContext,
    params: Partial<Record<string, string>>,
  ) => Promise<Feed | null>,
) =>
  withHasPermission<Promise<Partial<Record<string, string>>>>(
    "bookRead",
    OPDS_AUTH_OPTIONS,
  )(async (request, context) => {
    const config = await getOPDSConfig()
    if (!config.enabled) {
      return new NextResponse("OPDS is disabled", { status: 404 })
    }

    const params = await context.params
    const version = parseVersion(params["version"])
    if (!version) {
      return notFound()
    }

    const searchParams = request.nextUrl.searchParams
    const feed = await build(
      {
        version,
        viewer: request.auth.user,
        format: config.format,
        sort: config.sort,
        pageSize: config.pageSize,
        page: parseInt(searchParams.get("page") ?? "1", 10),
        params: searchParams,
      },
      params,
    )

    return feed ? respond(version, feed) : notFound()
  })
