import { withHasPermission } from "@/auth"
import { getSettings, updateSettings } from "@/database/settings"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export const GET = withHasPermission("settings_update")(async () => {
  const settings = await getSettings()

  return NextResponse.json({
    smtp_host: settings.smtpHost,
    smtp_port: settings.smtpPort,
    smtp_username: settings.smtpUsername,
    smtp_password: settings.smtpPassword,
    smtp_from: settings.smtpFrom,
    smtp_ssl: settings.smtpSsl ?? true,
    smtp_reject_unauthorized: settings.smtpRejectUnauthorized ?? true,
    library_name: settings.libraryName,
    web_url: settings.webUrl,
    codec: settings.codec,
    bitrate: settings.bitrate,
  })
})

type SettingsRequest = {
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password: string
  smtp_from: string
  smtp_ssl: boolean
  smtp_reject_unauthorized: boolean
  library_name: string
  web_url: string
  codec: string | null
  bitrate: string | null
}

export const PUT = withHasPermission("settings_update")(async (request) => {
  const settings = (await request.json()) as SettingsRequest

  console.log("route", settings)
  await updateSettings({
    smtpHost: settings.smtp_host,
    smtpPort: settings.smtp_port,
    smtpUsername: settings.smtp_username,
    smtpPassword: settings.smtp_password,
    smtpFrom: settings.smtp_from,
    smtpSsl: settings.smtp_ssl,
    smtpRejectUnauthorized: settings.smtp_reject_unauthorized,
    libraryName: settings.library_name,
    webUrl: settings.web_url,
    codec: settings.codec,
    bitrate: settings.bitrate,
  })

  return new Response(null, { status: 204 })
})
