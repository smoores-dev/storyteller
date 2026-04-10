import { NextResponse } from "next/server"

import {
  getScanState,
  runLibraryScan,
} from "@/assets/autoimport/scanManager"
import { type ScanOptions } from "@/assets/autoimport/scanner"
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
  void runLibraryScan(controller.signal, options)

  return new Response(null, { status: 204 })
})
