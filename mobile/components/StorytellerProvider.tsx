import Clipboard from "@react-native-clipboard/clipboard"
import { DefaultTheme, ThemeProvider } from "@react-navigation/native"
import { skipToken } from "@reduxjs/toolkit/query"
import { PortalHost } from "@rn-primitives/portal"
import convert from "color-convert"
import * as Fonts from "expo-font"
import * as Linking from "expo-linking"
import { SplashScreen } from "expo-router"
import { Migrator, NO_MIGRATIONS } from "kysely"
import { vars } from "nativewind"
import { type ReactNode, useEffect, useState } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

import { db } from "@/database/db"
import ExpoMigrationProvider from "@/database/migratonProvider"
import { activeBackgroundColor } from "@/design"
import { useColorTheme } from "@/hooks/useColorTheme"
import { logger } from "@/logger"
import { migrations } from "@/migrations/migrations"
import { bookImported } from "@/store/actions"
import { useAppDispatch } from "@/store/appState"
import {
  useLazyGetGlobalPreferencesQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"
import { getCustomFontUrl } from "@/store/persistence/fonts"
import { registerBackgroundTaskAsync } from "@/tasks/backgroundTaskSyncPositions"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"
import { Text } from "./ui/text"

const darkTheme = {
  "--background": "0 0% 3.9%",
  "--foreground": "0 0% 98%",
  "--card": "0 0% 3.9%",
  "--card-foreground": "0 0% 98%",
  "--popover": "0 0% 3.9%",
  "--popover-foreground": "0 0% 98%",
  "--primary": "22 85% 59%",
  "--primary-foreground": "0 0% 98%",
  "--secondary": "0 0% 14.9%",
  "--secondary-foreground": "0 0% 98%",
  "--muted": "0 0% 14.9%",
  "--muted-foreground": "0 0% 63.9%",
  "--accent": "0 0% 14.9%",
  "--accent-foreground": "0 0% 98%",
  "--link": "206, 96%, 72%",
  "--destructive": "0 70.9% 59.4%",
  "--border": "0 0% 14.9%",
  "--input": "0 0% 14.9%",
  "--ring": "300 0% 45%",
  "--chart-1": "220 70% 50%",
  "--chart-2": "160 60% 45%",
  "--chart-3": "30 80% 55%",
  "--chart-4": "280 65% 60%",
  "--chart-5": "340 75% 55%",
}

export function StorytellerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const { foreground, background, dark } = useColorTheme(
    ready ? undefined : skipToken,
  )
  const [getPreferences] = useLazyGetGlobalPreferencesQuery()

  const [updatePreference] = useUpdateGlobalPreferenceMutation()

  const [migrationError, setMigrationError] = useState<null | {
    migrationName: string | undefined
    error: string
  }>(null)

  useEffect(() => {
    async function setup() {
      const migrator = new Migrator({
        db,
        provider: new ExpoMigrationProvider({ migrations }),
      })

      const { results, error } = await migrator.migrateToLatest()
      if (error) {
        const failedResult = results?.find(
          (result) => result.status === "Error",
        )
        if (failedResult) {
          const allMigrations = await migrator.getMigrations()
          const failedIndex = allMigrations.findIndex(
            (migration) => failedResult.migrationName === migration.name,
          )
          const beforeFailed = allMigrations[failedIndex - 1]
          // console.log("rolling back to", beforeFailed?.name ?? NO_MIGRATIONS)
          await migrator.migrateTo(beforeFailed?.name ?? NO_MIGRATIONS)
          const failed = allMigrations[failedIndex]!
          const migration = migrations[failed.name as keyof typeof migrations]
          if ("down" in migration) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await migration.down(db as any)
          }
        }
        logger.error(`Migration failed (${failedResult?.migrationName}):`)
        logger.error(error.toString())
        setMigrationError({
          migrationName: failedResult?.migrationName,
          error: error.toString(),
        })
        return
      }

      const preferences = await getPreferences().unwrap()

      let customFonts = preferences.customFonts
      // Attempt to load fonts one at a time so that
      // we can handle failures
      for (const font of preferences.customFonts) {
        try {
          await Fonts.loadAsync({
            [font.name]: { uri: getCustomFontUrl(font.filename) },
          })
        } catch (e) {
          logger.error(
            `Failed to load custom font: ${font.name}@${font.filename}`,
          )
          logger.error(e)
          customFonts = customFonts.filter((f) => f.filename !== font.filename)
        }
      }
      if (customFonts.length !== preferences.customFonts.length) {
        await updatePreference({ name: "customFonts", value: customFonts })
        if (
          !customFonts.some((f) => f.name === preferences.typography.fontFamily)
        ) {
          await updatePreference({
            name: "typography",
            value: { ...preferences.typography, fontFamily: "Literata" },
          })
        }
      }

      await registerBackgroundTaskAsync()
      setReady(true)
      SplashScreen.hideAsync()
    }

    try {
      setup()
    } catch (e) {
      logger.error(e)
      setMigrationError({
        migrationName: "Startup",
        error:
          typeof e === "object" &&
          e &&
          "toString" in e &&
          typeof e.toString === "function"
            ? e.toString()
            : "unknown",
      })
    }
  }, [getPreferences, updatePreference])

  const dispatch = useAppDispatch()

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (!url?.startsWith("content://") && !url?.startsWith("file://")) return
      dispatch(bookImported({ url }))
    })

    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (!url.startsWith("content://") && !url.startsWith("file://")) return
      dispatch(bookImported({ url }))
    })

    return () => subscription.remove()
  }, [dispatch])

  const bg = convert.hex.hsl(background)
  const fg = convert.hex.hsl(foreground)
  const bgHsl = `${bg[0]} ${bg[1]}% ${bg[2]}%`
  const fgHsl = `${fg[0]} ${fg[1]}% ${fg[2]}%`

  return (
    <ThemeProvider
      value={{
        ...DefaultTheme,
        dark,
        colors: {
          primary: foreground,
          background,
          card: background,
          text: foreground,
          border: activeBackgroundColor,
          notification: background,
        },
      }}
    >
      <View
        className="flex-1"
        style={vars({
          ...(dark && darkTheme),
          "--background": bgHsl,
          "--foreground": fgHsl,
          "--card": bgHsl,
          "--card-foreground": fgHsl,
          "--secondary-foreground": fgHsl,
          "--secondary": `${fgHsl} / 0.1`,
          "--border": `${fgHsl} / 0.2`,
          "--input": `${fgHsl} / 0.2`,
        })}
      >
        {ready && children}
        <PortalHost name="migration-error" />
        <AlertDialog open={!!migrationError}>
          {/**<AlertDialogTrigger ref={triggerRef} />**/}
          <AlertDialogContent portalHost="migration-error">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Migration failed ({migrationError?.migrationName})
              </AlertDialogTitle>
              <AlertDialogDescription>
                <ScrollView>
                  <Text>
                    Failed to run local database migration. Please report on
                    GitLab or Discord!
                  </Text>
                  <Text>{migrationError?.error}</Text>
                </ScrollView>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                onPress={() => {
                  Clipboard.setString(
                    `${migrationError?.migrationName}: ${migrationError?.error}`,
                  )
                }}
              >
                <Text>Copy error to clipboard</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </View>
    </ThemeProvider>
  )
}
