import { ApiClientError } from "@/apiClient"
import { Settings } from "@/apiModels"
import { redirect } from "next/navigation"
import { createAuthedApiClient } from "@/authedApiClient"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { logger } from "@/logging"
import { Title } from "@mantine/core"

const defaultSettings: Settings = {
  smtp_host: "",
  smtp_port: 0,
  smtp_username: "",
  smtp_password: "",
  smtp_from: "",
  smtp_ssl: true,
  smtp_reject_unauthorized: true,
  library_name: "",
  web_url: "",
  max_track_length: 2,
  codec: "",
  bitrate: "",
  transcription_engine: "whisper.cpp",
  whisper_build: "cpu",
  whisper_model: "tiny",
  google_cloud_api_key: "",
  azure_subscription_key: "",
  azure_service_region: "",
  amazon_transcribe_region: "",
  amazon_transcribe_access_key_id: "",
  amazon_transcribe_secret_access_key: "",
  open_ai_api_key: "",
  open_ai_organization: "",
  open_ai_base_url: "",
  open_ai_model_name: "",
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
