import { Box, Button, Title } from "@mantine/core"
import { IconDownload } from "@tabler/icons-react"
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
  const [settings, configLockedKeys] = await Promise.all([
    fetchApiRoute<Settings>("/settings"),
    fetchApiRoute<(keyof Settings)[]>("/settings/config-locked-keys"),
  ])
  const authUrl = env.AUTH_URL
  const whisperVariant = env.STORYTELLER_WHISPER_VARIANT

  return (
    <>
      <Box className="flex items-center justify-between">
        <Title order={2}>Settings</Title>
        <Button
          component="a"
          href="/api/v2/settings"
          download="storyteller-config.json"
          variant="subtle"
          size="sm"
          leftSection={<IconDownload size={16} />}
        >
          Export as JSON
        </Button>
      </Box>
      <SettingsForm
        settings={settings}
        authUrl={authUrl}
        whisperVariant={whisperVariant}
        configLockedKeys={configLockedKeys}
      />
    </>
  )
}
