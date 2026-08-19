import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getDataDirAnchor } from "@/database/pathRewrite"
import { DATA_DIR } from "@/directories"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("settingsUpdate")(async () => {
  return NextResponse.json({
    anchor: await getDataDirAnchor(),
    currentDataDir: DATA_DIR,
  })
})
