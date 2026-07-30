"use client"

import { createContext, useContext, useEffect, useMemo } from "react"

import {
  type PreferenceDefaults,
  type UserPreferences,
  defaultUserPreferences,
  resolveUserPreferences,
} from "@/database/userPreferencesTypes"
import { useGetUserSettingsQuery } from "@/store/api"

const UserPreferencesContext = createContext<UserPreferences>(
  defaultUserPreferences,
)

export function UserPreferencesProvider({
  initialPreferences,
  preferenceDefaults = {},
  children,
}: {
  initialPreferences: UserPreferences
  preferenceDefaults?: PreferenceDefaults
  children: React.ReactNode
}) {
  const { data: rawSettings } = useGetUserSettingsQuery()

  const preferences = useMemo(() => {
    if (!rawSettings) return initialPreferences
    return resolveUserPreferences(rawSettings, preferenceDefaults)
  }, [rawSettings, initialPreferences, preferenceDefaults])

  // the shell theme attribute is server-rendered by the app layout, which
  // doesn't re-render when the client cache updates -- keep it live here
  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-shell]")) {
      el.dataset["shell"] = preferences.shellTheme
    }
  }, [preferences.shellTheme])

  return (
    <UserPreferencesContext.Provider value={preferences}>
      {children}
    </UserPreferencesContext.Provider>
  )
}

export function useUserPreferences(): UserPreferences {
  return useContext(UserPreferencesContext)
}
