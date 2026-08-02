import { NextResponse } from "next/server"

import { withUser } from "@/auth/auth"
import {
  type UserSettingValue,
  getUserSettings,
  updateUserSettings,
} from "@/database/userSettings"

export const dynamic = "force-dynamic"

/**
 * @summary Get the current user's settings
 */
export const GET = withUser(async (request) => {
  const settings = await getUserSettings(request.auth.user.id)
  return NextResponse.json(settings)
})

/**
 * @summary Merge updates into the current user's settings
 */
export const PUT = withUser(async (request) => {
  const body = (await request.json()) as Record<string, UserSettingValue>
  await updateUserSettings(request.auth.user.id, body)
  return new Response(null, { status: 204 })
})
