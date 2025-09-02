import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getSettings, updateSettings } from "@/database/settings"
import { type Settings } from "@/database/settingsTypes"

export const dynamic = "force-dynamic"

/**
 * @summary Get the current server settings
 * @desc '
 */
export const GET = withHasPermission("settingsUpdate")(async () => {
  const settings = await getSettings()

  return NextResponse.json(settings)
})

/**
 * @summary Update the server settings
 * @desc Requires a complete settings object
 */
export const PUT = withHasPermission("settingsUpdate")(async (request) => {
  const settings = (await request.json()) as Settings

  await updateSettings(settings)

  return new Response(null, { status: 204 })
})
