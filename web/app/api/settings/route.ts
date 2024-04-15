import { withHasPermission } from "@/auth"
import { getSettings, updateSettings } from "@/database/settings"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("settings_update")(async () => {
  const settings = await getSettings()
  return NextResponse.json(settings)
})

type SettingsRequest = {
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password: string
  smtp_from: string
  library_name: string
  web_url: string
}

export const PUT = withHasPermission("settings_update")(async (request) => {
  const settings = (await request.json()) as SettingsRequest

  await updateSettings({
    smtpHost: settings.smtp_host,
    smtpPort: settings.smtp_port,
    smtpUsername: settings.smtp_username,
    smtpPassword: settings.smtp_password,
    smtpFrom: settings.smtp_from,
    libraryName: settings.library_name,
    webUrl: settings.web_url,
  })

  return new Response(null, { status: 204 })
})
