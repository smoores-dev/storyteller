import { useEffect, useState } from "react"

import { isTauriApp } from "@/isTauriApp"

export function useIsTauri() {
  const [isTauri, setIsTauri] = useState(false)

  useEffect(() => {
    setIsTauri(isTauriApp())
  }, [])

  return isTauri
}
