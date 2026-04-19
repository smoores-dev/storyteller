import { NextResponse } from "next/server"

import { scanExistingBooks } from "@/assets/library/scanExisting"
import {
  getScanState,
  runExclusive,
  runImportScans,
} from "@/assets/library/scanManager"
import { type ScanOptions } from "@/assets/library/scanner"
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
  const signal = controller.signal

  void runExclusive("manual", signal, async () => {
    const scannedUuids = await runImportScans(signal)
    if (signal.aborted) {
      return
    }

    await scanExistingBooks(signal, {
      scanOptions: options,
      excludeBookUuids: scannedUuids,
    })
  })

  return new Response(null, { status: 204 })
})
