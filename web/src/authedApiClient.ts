import { cookies } from "next/headers"
import { ApiClient, ApiClientError } from "./apiClient"
import { apiHost, proxyRootPath } from "./app/apiHost"
import { logger } from "./logging"

export async function createAuthedApiClient() {
  const cookieStore = await cookies()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const authTokenCookie = cookieStore.get("st_token")!

  return new ApiClient(apiHost, proxyRootPath, authTokenCookie.value)
}

export async function getCurrentUser() {
  const client = await createAuthedApiClient()
  try {
    return await client.getCurrentUser()
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode >= 500) {
      logger.error(e)
    }
  }
  return null
}
