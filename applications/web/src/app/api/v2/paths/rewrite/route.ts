import { NextResponse } from "next/server"
import { z } from "zod"

import { withHasPermission } from "@/auth/auth"
import {
  applyRewrite,
  getDataDirAnchor,
  previewRewrite,
  setDataDirAnchor,
} from "@/database/pathRewrite"
import { DATA_DIR } from "@/directories"

export const dynamic = "force-dynamic"

const RewriteRequestSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  dryRun: z.boolean().default(true),
})

export const POST = withHasPermission("settingsUpdate")(async (request) => {
  const parsed = RewriteRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    )
  }

  const { from, to, dryRun } = parsed.data
  if (from === to) {
    return NextResponse.json(
      { error: "from and to are identical" },
      { status: 400 },
    )
  }

  if (dryRun) {
    return NextResponse.json({ preview: await previewRewrite(from, to) })
  }

  const result = await applyRewrite(from, to)

  const anchor = await getDataDirAnchor()
  if (anchor !== null && anchor !== DATA_DIR && from.startsWith(anchor)) {
    await setDataDirAnchor(DATA_DIR)
  }

  return NextResponse.json({ result })
})
