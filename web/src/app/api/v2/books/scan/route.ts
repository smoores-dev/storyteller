import { NextResponse } from "next/server"

import { type ScanOptions } from "@/assets/library/scanner/ctx"
import { getScanState, scanLibrary } from "@/assets/library/scanner/scan"
import { withHasPermission } from "@/auth/auth"

export const dynamic = "force-dynamic"

export function parseScanOptions(params: URLSearchParams): ScanOptions {
  const options: ScanOptions = {}

  if (params.get("force") === "true") {
    options.force = true
  }

  const override = params.get("metadataOverride")
  if (
    override === "never" ||
    override === "fill-empty" ||
    override === "always"
  ) {
    options.metadataOverrideMode = override
  }

  return options
}

export const GET = withHasPermission("bookProcess")(() => {
  return NextResponse.json(getScanState())
})

export const POST = withHasPermission("bookProcess")((request) => {
  const options = parseScanOptions(request.nextUrl.searchParams)
  const controller = new AbortController()

  void scanLibrary({ source: "manual", options, signal: controller.signal })

  return new Response(null, { status: 204 })
})
