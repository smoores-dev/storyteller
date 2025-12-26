import { type RootState } from "@/store/appState"

export function getDebugLoggingEnabled(state: RootState) {
  return state.logging.debugEnabled
}
