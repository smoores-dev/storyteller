import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import {
  type UserSettingValue,
  getUserSettings,
  updateUserSettings,
} from "@/database/userSettings"

export const dynamic = "force-dynamic"

/**
 * @summary Get the current user's settings
 */
export const GET = withHasPermission("manageSelf")(async (request) => {
  const settings = await getUserSettings(request.auth.user.id)
  return NextResponse.json(settings)
})

/**
 * @summary Merge updates into the current user's settings
 */
export const PUT = withHasPermission("manageSelf")(async (request) => {
  const body = (await request.json()) as Record<string, UserSettingValue>
  await updateUserSettings(request.auth.user.id, body)
  return NextResponse.json(await getUserSettings(request.auth.user.id))
})
