import { cookies } from "next/headers"
import { ApiClient } from "./apiClient"
import { apiHost, rootPath } from "./app/apiHost"
import { Token } from "./apiModels"

export function createAuthedApiClient() {
  const cookieStore = cookies()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const authTokenCookie = cookieStore.get("st_token")!

  const token = JSON.parse(atob(authTokenCookie.value)) as Token
  return new ApiClient(apiHost, rootPath, token.access_token)
}
