import { ApiClient, Token } from "@/apiClient"
import { useRef } from "react"

export function useApiClient(apiHost: string, token: Token | undefined) {
  return useRef(
    new ApiClient({
      BASE: apiHost,
      ...(token?.access_token && { TOKEN: token?.access_token }),
    })
  ).current
}
