import { ApiClient } from "@/apiClient"
import { ApiHostContext } from "@/contexts/ApiHostContext"
import { useContext, useRef } from "react"

export function useApiClient() {
  const apiHost = useContext(ApiHostContext)

  return useRef(new ApiClient(apiHost)).current
}
