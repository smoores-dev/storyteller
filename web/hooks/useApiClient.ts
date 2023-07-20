import { ApiClient } from "@/apiClient"
import { useRef } from "react"

export function useApiClient() {
  return useRef(new ApiClient()).current
}
