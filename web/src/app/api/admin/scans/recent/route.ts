import { NextResponse } from "next/server"

import { getRecentScanReports } from "@/assets/library/scanner/scan"
import { withHasPermission } from "@/auth/auth"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("bookProcess")(() => {
  return NextResponse.json(getRecentScanReports())
})
