import { ApiClient } from "@/apiClient"
import { ApiHostContext } from "@/contexts/ApiHostContext"
import { useContext, useRef } from "react"

export function useApiClient() {
  const { origin, rootPath } = useContext(ApiHostContext)

  return useRef(new ApiClient(origin, rootPath)).current
}
