import { NextResponse } from "next/server"

import { type ScanOptions } from "@/assets/library/scanner/ctx"
import { getScanState, scanLibrary } from "@/assets/library/scanner/scan"
import { withHasPermission } from "@/auth/auth"
import {
  MetadataFieldOverridesSchema,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"

export const dynamic = "force-dynamic"

export function parseScanOptions(
  params: URLSearchParams,
  body?: unknown,
): ScanOptions {
  const options: ScanOptions = {}

  if (params.get("force") === "true") {
    options.force = true
  }

  // support per-field overrides from request body
  if (body && typeof body === "object" && "metadataFieldOverrides" in body) {
    const record = body as Record<string, unknown>
    const parsed = MetadataFieldOverridesSchema.safeParse(
      record["metadataFieldOverrides"],
    )

    if (parsed.success) {
      options.metadataFieldOverrides = parsed.data
    }
  }

  // backward compat: blanket override via query param
  const override = params.get("metadataOverride")
  if (
    !options.metadataFieldOverrides &&
    (override === "skip" || override === "fill-empty" || override === "always")
  ) {
    options.metadataFieldOverrides = defaultMetadataFieldOverrides(override)
  }

  return options
}

export const GET = withHasPermission("bookProcess")(() => {
  return NextResponse.json(getScanState())
})

export const POST = withHasPermission("bookProcess")(async (request) => {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    // no body is fine
  }

  const options = parseScanOptions(request.nextUrl.searchParams, body)
  const controller = new AbortController()

  void scanLibrary({ source: "manual", options, signal: controller.signal })

  return new Response(null, { status: 204 })
})

export const DELETE = withHasPermission("bookProcess")(async (request) => {
  const controller = new AbortController()
  cancelScan(controller.signal)

  return new Response(null, { status: 204 })
})
