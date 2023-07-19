import { Token } from "@/apiClient"

export function useApiToken() {
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

  return token
}
