import { RootState } from "../appState"

export function getPreferences(state: RootState) {
  return state.preferences
}
