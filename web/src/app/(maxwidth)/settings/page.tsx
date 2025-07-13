import { ApiClientError } from "@/apiClient"
import { Settings } from "@/apiModels"
import { redirect } from "next/navigation"
import { createAuthedApiClient } from "@/authedApiClient"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { logger } from "@/logging"
import { Title } from "@mantine/core"

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
      <SettingsForm settings={{ ...settings }} />
    </>
  )
}
