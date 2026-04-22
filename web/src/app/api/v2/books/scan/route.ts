import { NextResponse } from "next/server"

import { Scan, type ScanOptions, getScanState } from "@/assets/library/scan"
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

  void (async () => {
    const scan = await Scan.fullLibrary("manual", options)
    await scan.execute(controller.signal)
  })()

  return new Response(null, { status: 204 })
})
