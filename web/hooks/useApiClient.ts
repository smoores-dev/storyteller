import { ApiClient } from "@/apiClient"
import { useRef } from "react"
import { useApiToken } from "./useApiToken"

export function useApiClient(apiHost: string) {
  const token = useApiToken()

  return useRef(
    new ApiClient({
      BASE: apiHost,
      ...(token?.access_token && { TOKEN: token?.access_token }),
    })
  ).current
}
