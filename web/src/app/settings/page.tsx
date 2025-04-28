import { ApiClientError } from "@/apiClient"
import { Settings } from "@/apiModels"
import { redirect } from "next/navigation"
import { createAuthedApiClient } from "@/authedApiClient"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { logger } from "@/logging"
import { Title } from "@mantine/core"

const defaultSettings: Settings = {
  smtpHost: "",
  smtpPort: 0,
  smtpUsername: "",
  smtpPassword: "",
  smtpFrom: "",
  smtpSsl: true,
  smtpRejectUnauthorized: true,
  libraryName: "",
  webUrl: "",
  maxTrackLength: 2,
  codec: "",
  bitrate: "",
  transcriptionEngine: "whisper.cpp",
  whisperBuild: "cpu",
  whisperModel: "tiny",
  googleCloudApiKey: "",
  azureSubscriptionKey: "",
  azureServiceRegion: "",
  amazonTranscribeRegion: "",
  amazonTranscribeAccessKeyId: "",
  amazonTranscribeSecretAccessKey: "",
  openAiApiKey: "",
  openAiOrganization: "",
  openAiBaseUrl: "",
  openAiModelName: "",
  deepgramApiKey: "",
  deepgramModel: "",
  parallelTranscribes: 1,
  parallelTranscodes: 1,
  parallelWhisperBuild: 1,
}

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const client = await createAuthedApiClient()

  let settings: Settings

  try {
    settings = await client.getSettings()
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }

    if (e instanceof ApiClientError && e.statusCode === 403) {
      return (
        <>
          <Title order={2}>Forbidden</Title>
          <p>You don&apos;t have permission to see this page</p>
        </>
      )
    }

    logger.error(e)

    return (
      <>
        <Title order={2}>API is down</Title>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </>
    )
  }

  return (
    <>
      <Title order={2}>Settings</Title>
      {/* This isn't enough to fill in defaults. We have to handle props that exist and are set to null, to */}
      <SettingsForm settings={{ ...defaultSettings, ...settings }} />
    </>
  )
}
