import Clipboard from "@react-native-clipboard/clipboard"
import { DefaultTheme, ThemeProvider } from "@react-navigation/native"
import { PortalHost } from "@rn-primitives/portal"
import * as Fonts from "expo-font"
import * as Linking from "expo-linking"
import { SplashScreen } from "expo-router"
import { Migrator, NO_MIGRATIONS } from "kysely"
import { type ReactNode, useEffect, useState } from "react"
import { StatusBar, View } from "react-native"
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

export function StorytellerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const { foreground, background, dark } = useColorTheme()
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
      <StatusBar
        barStyle={dark ? "light-content" : "dark-content"}
        translucent
      />
      <View className="flex-1">
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
