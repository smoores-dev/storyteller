import { NextResponse } from "next/server"

import { ctcDeviceCapabilities } from "@storyteller-platform/ghost-story/constants"

import { type ServerCapabilities } from "@/apiModels"
import { withUser } from "@/auth/auth"
import { env } from "@/env"

export const dynamic = "force-dynamic"

export const GET = withUser(() => {
  const capabilities: ServerCapabilities = {
    ctcDevices: ctcDeviceCapabilities(env.STORYTELLER_WHISPER_VARIANT),
  }

  return NextResponse.json(capabilities, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  })
})
