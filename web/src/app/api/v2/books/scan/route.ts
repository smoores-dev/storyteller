import { NextResponse } from "next/server"

import {
  getScanState,
  runAllImportScans,
  runExistingBooksScan,
} from "@/assets/autoimport/scanManager"
import { type ScanOptions } from "@/assets/autoimport/scanner"
import { withHasPermission } from "@/auth/auth"

export const dynamic = "force-dynamic"

type ScanScope = "existing" | "imports" | "all"

function getScope(value: string | null): ScanScope {
  if (value === "imports") {
    return "imports"
  }

  if (value === "all") {
    return "all"
  }

  return "existing"
}

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

async function triggerScopeScan(scope: ScanScope, options: ScanOptions) {
  const controller = new AbortController()

  if (scope === "imports") {
    await runAllImportScans(controller.signal)
    return
  }

  if (scope === "all") {
    await runExistingBooksScan(controller.signal, options)
    await runAllImportScans(controller.signal)
    return
  }

  await runExistingBooksScan(controller.signal, options)
}

export const GET = withHasPermission("bookProcess")(() => {
  return NextResponse.json(getScanState())
})

export const POST = withHasPermission("bookProcess")((request) => {
  const scope = getScope(request.nextUrl.searchParams.get("scope"))
  const options = parseScanOptions(request.nextUrl.searchParams)
  void triggerScopeScan(scope, options)

  return new Response(null, { status: 204 })
})
