import { type RootState } from "../appState"

export function getOpenDialog(state: RootState) {
  return state.toolbar.openDialog
}
