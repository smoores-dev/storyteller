export const TAURI_UA_TOKEN = "StorytellerTauri"

export function isTauriApp(): boolean {
  if (typeof window === "undefined") return false

  return (
    navigator.userAgent.includes(TAURI_UA_TOKEN) ||
    "__TAURI__" in window ||
    "__TAURI_INTERNALS__" in window
  )
}
