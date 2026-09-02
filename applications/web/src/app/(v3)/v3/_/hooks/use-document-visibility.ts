import { useSyncExternalStore } from "react"

const subscribe = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange)
  return () => {
    document.removeEventListener("visibilitychange", onChange)
  }
}

export function useDocumentVisibility(): DocumentVisibilityState {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState,
    () => "visible",
  )
}
