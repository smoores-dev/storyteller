import { ApiClient } from "@/apiClient"
import { ApiHostContext } from "@/contexts/ApiHostContext"
import { useContext, useRef } from "react"

export function useApiClient() {
  const { rootPath } = useContext(ApiHostContext)
  const origin = window.location.origin

  return useRef(new ApiClient(origin, rootPath)).current
}
