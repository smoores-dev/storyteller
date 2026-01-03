import { Uniwind } from "uniwind"

import { localApi } from "@/store/localApi"

import { startAppListening } from "./listenerMiddleware"

startAppListening({
  matcher: localApi.endpoints.updateGlobalPreference.matchPending,
  effect: async (_, listenerApi) => {
    const { data: originalPreferences } =
      localApi.endpoints.getGlobalPreferences.select()(
        listenerApi.getOriginalState(),
      )

    const { data: preferences } =
      localApi.endpoints.getGlobalPreferences.select()(listenerApi.getState())

    if (!preferences) return

    if (originalPreferences?.darkMode !== preferences.darkMode) {
      Uniwind.setTheme(
        preferences.darkMode === true
          ? "dark"
          : preferences.darkMode === "auto"
            ? "system"
            : "light",
      )
      return
    }

    const preferenceName =
      Uniwind.currentTheme === "dark" ? "darkTheme" : "lightTheme"

    if (
      originalPreferences?.[preferenceName] === preferences?.[preferenceName]
    ) {
      return
    }

    const originalTheme = originalPreferences.colorThemes.find(
      (theme) => theme.name === originalPreferences[preferenceName],
    )
    const theme = preferences.colorThemes.find(
      (theme) => theme.name === preferences[preferenceName],
    )

    if (!theme) return

    if (
      originalTheme?.foreground === theme.foreground &&
      originalTheme.background === theme.background
    ) {
      return
    }

    const { background, foreground } = theme

    Uniwind.updateCSSVariables(Uniwind.currentTheme, {
      "--color-background": background,
      "--color-foreground": foreground,
      "--color-card": background,
      "--color-card-foreground": foreground,
      "--color-secondary-foreground": foreground,
      "--color-secondary": `${foreground}19`,
      "--color-border": `${foreground}38`,
      "--color-input": `${foreground}38`,
    })
  },
})

startAppListening({
  predicate: () => true,
  effect: async (_, listenerApi) => {
    listenerApi.unsubscribe()
    const { data: preferences } =
      localApi.endpoints.getGlobalPreferences.select()(listenerApi.getState())

    if (!preferences) return

    Uniwind.setTheme(
      preferences.darkMode === true
        ? "dark"
        : preferences.darkMode === "auto"
          ? "system"
          : "light",
    )
    const preferenceName =
      Uniwind.currentTheme === "dark" ? "darkTheme" : "lightTheme"
    const theme = preferences.colorThemes.find(
      (theme) => theme.name === preferences[preferenceName],
    )
    if (!theme) return

    const { background, foreground } = theme

    Uniwind.updateCSSVariables(Uniwind.currentTheme, {
      "--color-background": background,
      "--color-foreground": foreground,
      "--color-card": background,
      "--color-card-foreground": foreground,
      "--color-secondary-foreground": foreground,
      "--color-secondary": `${foreground}19`,
      "--color-border": `${foreground}38`,
      "--color-input": `${foreground}38`,
    })
  },
})
