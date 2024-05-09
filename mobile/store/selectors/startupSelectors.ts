import { RootState } from "../appState"

export function getStartupStatus(state: RootState) {
  return state.startup.startupStatus
}
