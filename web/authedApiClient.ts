import { cookies } from "next/headers"
import { ApiClient } from "./apiClient"
import { apiHost, proxyRootPath } from "./app/apiHost"

export function createAuthedApiClient() {
  const cookieStore = cookies()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const authTokenCookie = cookieStore.get("st_token")!

  return new ApiClient(apiHost, proxyRootPath, authTokenCookie.value)
}
