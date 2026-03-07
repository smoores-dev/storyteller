import { NextResponse } from "next/server"

import {
  getScanState,
  runAllImportScans,
  runExistingBooksScan,
} from "@/assets/autoimport/scanManager"
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

async function triggerScopeScan(scope: ScanScope) {
  const controller = new AbortController()

  if (scope === "imports") {
    await runAllImportScans(controller.signal)
    return
  }

  if (scope === "all") {
    await runExistingBooksScan(controller.signal)
    await runAllImportScans(controller.signal)
    return
  }

  await runExistingBooksScan(controller.signal)
}

export const GET = withHasPermission("bookProcess")(() => {
  return NextResponse.json(getScanState())
})

export const POST = withHasPermission("bookProcess")((request) => {
  const scope = getScope(request.nextUrl.searchParams.get("scope"))
  void triggerScopeScan(scope)

  return new Response(null, { status: 204 })
})
