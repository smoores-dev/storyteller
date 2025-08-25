import { Settings } from "@/apiModels"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { Title } from "@mantine/core"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const settings = await fetchApiRoute<Settings>("/settings")

  return (
    <>
      <Title order={2}>Settings</Title>
      <SettingsForm settings={settings} />
    </>
  )
}
