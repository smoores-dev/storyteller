import { createSelector } from "@reduxjs/toolkit"
import { RootState } from "../appState"
import deepmerge from "deepmerge"

export function getGlobalPreferences(state: RootState) {
  return state.preferences
}

export function getDarkMode(state: RootState) {
  return getGlobalPreferences(state).darkMode
}

export function getColorTheme(state: RootState, dark: boolean) {
  const preferences = getGlobalPreferences(state)
  const themeName = dark ? preferences.darkTheme : preferences.lightTheme
  return preferences.colorThemes.find((theme) => theme.name === themeName)!
}

export function getBookPreferences(state: RootState, bookId: number) {
  return getGlobalPreferences(state).bookPreferences[bookId] ?? null
}

export const getFilledBookPreferences = createSelector(
  getGlobalPreferences,
  getBookPreferences,
  (globalPreferences, bookPreferences) => {
    if (!bookPreferences) return globalPreferences

    return deepmerge(globalPreferences, bookPreferences)
  },
)

export function getBookPlayerSpeed(state: RootState, bookId: number) {
  return getBookPreferences(state, bookId)?.audio?.speed ?? 1
}
