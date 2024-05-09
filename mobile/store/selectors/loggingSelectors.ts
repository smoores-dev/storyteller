import { RootState } from "../appState"

export function getDebugLoggingEnabled(state: RootState) {
  return state.logging.debugEnabled
}
