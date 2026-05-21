import { NextResponse } from "next/server"

import { type ScanOptions } from "@/assets/library/scanner/ctx"
import {
  cancelActiveScan,
  getScanState,
  scanBooks,
  scanLibrary,
} from "@/assets/library/scanner/scan"
import { withHasPermission } from "@/auth/auth"
import {
  MetadataFieldOverridesSchema,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import { type UUID } from "@/uuid"

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
    (override === "skip" || override === "merge" || override === "always")
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

  const record = body as Record<string, unknown> | null
  const rawUuids = record?.["bookUuids"]

  if (Array.isArray(rawUuids) && rawUuids.every((u) => typeof u === "string")) {
    void scanBooks({
      source: "manual",
      bookUuids: rawUuids as UUID[],
      options,
      signal: controller.signal,
    })
  } else {
    void scanLibrary({ source: "manual", options, signal: controller.signal })
  }

  return new Response(null, { status: 204 })
})

export const DELETE = withHasPermission("bookProcess")(() => {
  cancelActiveScan()
  return new Response(null, { status: 204 })
})
