"use client"

import { createContext, useContext, useEffect } from "react"

import { ACCENT_TOKENS } from "@v3/_/lib/accent-tokens"

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

  const preferences = rawSettings
    ? resolveUserPreferences(rawSettings, preferenceDefaults)
    : initialPreferences

  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-shell]")) {
      el.dataset["shell"] = preferences.shellTheme
    }
    document.documentElement.dataset["shell"] = preferences.shellTheme
  }, [preferences.shellTheme])

  const accentColor = preferences.accentColor

  useEffect(() => {
    const targets = [
      document.documentElement,
      ...document.querySelectorAll<HTMLElement>("[data-shell]"),
    ]

    const apply = (color: string | null) => {
      for (const el of targets) {
        for (const token of ACCENT_TOKENS) {
          if (color === null) el.style.removeProperty(token)
          else el.style.setProperty(token, color)
        }
      }
    }

    apply(accentColor)

    return () => {
      apply(null)
    }
  }, [accentColor])

  return (
    <UserPreferencesContext.Provider value={preferences}>
      {children}
    </UserPreferencesContext.Provider>
  )
}

export function useUserPreferences(): UserPreferences {
  return useContext(UserPreferencesContext)
}
