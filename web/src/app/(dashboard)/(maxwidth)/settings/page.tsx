import { Title } from "@mantine/core"
import type { Metadata } from "next"

import type { Settings } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { env } from "@/env"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const settings = await fetchApiRoute<Settings>("/settings")
  const authUrl = env.AUTH_URL

  return (
    <>
      <Title order={2}>Settings</Title>
      <SettingsForm settings={settings} authUrl={authUrl} />
    </>
  )
}
