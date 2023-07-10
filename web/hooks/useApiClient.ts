import { ApiClient, Token } from "@/apiClient"
import { useRef } from "react"

export function useApiClient(apiHost: string) {
  const cookies =
    typeof window === "undefined"
      ? []
      : window.document.cookie.split(";").map((cookie) => cookie.trim())

  const authTokenCookie = cookies
    .find((cookie) => cookie.startsWith("st_token="))
    ?.slice(9)

  const token =
    authTokenCookie === undefined
      ? authTokenCookie
      : (JSON.parse(atob(authTokenCookie)) as Token)

  return useRef(
    new ApiClient({
      BASE: apiHost,
      ...(token?.access_token && { TOKEN: token?.access_token }),
    })
  ).current
}
