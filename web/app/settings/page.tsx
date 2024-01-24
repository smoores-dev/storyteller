import { ApiClient, ApiClientError } from "@/apiClient"
import { Settings, Token } from "@/apiModels"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { apiHost, rootPath } from "../apiHost"
import styles from "./page.module.css"
import { revalidatePath } from "next/cache"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const cookieStore = cookies()

  const authTokenCookie = cookieStore.get("st_token")
  if (!authTokenCookie) {
    return redirect("/login")
  }

  const token = JSON.parse(atob(authTokenCookie.value)) as Token
  const client = new ApiClient(apiHost, rootPath, token.access_token)

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

    console.error(e)

    return (
      <main className={styles["main"]}>
        <h2>API is down</h2>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </main>
    )
  }

  async function updateSettings(data: FormData) {
    "use server"

    const libraryName = data.get("library-name")?.valueOf() as string
    const webUrl = data.get("web-url")?.valueOf() as string

    const smtpFrom = data.get("smtp-from")?.valueOf() as string
    const smtpHost = data.get("smtp-host")?.valueOf() as string
    const smtpPort = data.get("smtp-port")?.valueOf() as string
    const smtpUsername = data.get("smtp-username")?.valueOf() as string
    const smtpPassword = data.get("smtp-password")?.valueOf() as string

    const cookieStore = cookies()

    const authTokenCookie = cookieStore.get("st_token")
    if (!authTokenCookie) {
      return redirect("/login")
    }

    const token = JSON.parse(atob(authTokenCookie.value)) as Token
    const client = new ApiClient(apiHost, rootPath, token.access_token)

    await client.updateSettings({
      library_name: libraryName,
      web_url: webUrl,
      smtp_from: smtpFrom,
      smtp_host: smtpHost,
      smtp_port: parseInt(smtpPort, 10),
      smtp_username: smtpUsername,
      smtp_password: smtpPassword,
    })
    revalidatePath("/settings")
  }

  return (
    <main className={styles["main"]}>
      <h2>Settings</h2>
      <form className={styles["settings-form"]} action={updateSettings}>
        <fieldset>
          <legend>Library settings</legend>
          <label id="library-name-label" htmlFor="library-name">
            Library name
            <input
              id="library-name"
              name="library-name"
              defaultValue={settings.library_name}
            />
          </label>
          <label id="web-url-label" htmlFor="web-url">
            Web URL
            <input
              id="web-url"
              name="web-url"
              defaultValue={settings.web_url}
            />
          </label>
        </fieldset>
        <fieldset>
          <legend>Email settings</legend>
          <label id="smtp-host-label" htmlFor="smtp-host">
            SMTP host
            <input
              id="smtp-host"
              name="smtp-host"
              defaultValue={settings.smtp_host}
            />
          </label>
          <label id="smtp-port-label" htmlFor="smtp-port">
            SMTP port
            <input
              id="smtp-port"
              name="smtp-port"
              type="number"
              defaultValue={settings.smtp_port}
            />
          </label>
          <label id="smtp-from-label" htmlFor="smtp-from">
            SMTP from
            <input
              id="smtp-from"
              name="smtp-from"
              defaultValue={settings.smtp_from}
            />
          </label>
          <label id="smtp-username-label" htmlFor="smtp-username">
            SMTP username
            <input
              id="smtp-username"
              name="smtp-username"
              defaultValue={settings.smtp_username}
            />
          </label>
          <label id="smtp-password-label" htmlFor="smtp-password">
            SMTP password
            <input
              id="smtp-password"
              name="smtp-password"
              defaultValue={settings.smtp_password}
            />
          </label>
        </fieldset>
        <button type="submit">Update</button>
      </form>
    </main>
  )
}
