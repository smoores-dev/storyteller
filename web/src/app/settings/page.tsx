import { ApiClientError } from "@/apiClient"
import { Settings } from "@/apiModels"
import { redirect } from "next/navigation"
import styles from "./page.module.css"
import { createAuthedApiClient } from "@/authedApiClient"
import { SettingsForm } from "@/components/settings/SettingsForm"
import { logger } from "@/logging"

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
        <main className={styles["main"]}>
          <h2>Forbidden</h2>
          <p>You don&apos;t have permission to see this page</p>
        </main>
      )
    }

    logger.error(e)

    return (
      <main className={styles["main"]}>
        <h2>API is down</h2>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </main>
    )
  }

  return (
    <main className={styles["main"]}>
      <h2>Settings</h2>
      <SettingsForm settings={settings} />
    </main>
  )
}
