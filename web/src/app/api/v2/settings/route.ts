import { withHasPermission } from "@/auth"
import { getSettings, updateSettings } from "@/database/settings"
import { Settings } from "@/database/settingsTypes"
import { NextResponse } from "next/server"

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
