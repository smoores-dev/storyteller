import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { env } from "@/env"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

const VALID_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"]

export const GET = withHasPermission("settingsUpdate")(() => {
  return NextResponse.json({ level: logger.level })
})

export const PUT = withHasPermission("settingsUpdate")(async (request) => {
  const body = (await request.json()) as { level?: string }
  const newLevel = body.level

  if (!newLevel || !VALID_LEVELS.includes(newLevel)) {
    return NextResponse.json(
      { error: `Invalid level. Must be one of: ${VALID_LEVELS.join(", ")}` },
      { status: 400 },
    )
  }

  logger.level = newLevel
  // @ts-expect-error - nah i can
  env.STORYTELLER_LOG_LEVEL = newLevel
  logger.info(
    `Set log level to ${env.STORYTELLER_LOG_LEVEL}, intended ${newLevel}`,
  )

  return NextResponse.json({ level: newLevel })
})
