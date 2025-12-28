import { Link } from "expo-router"
import { PlusIcon } from "lucide-react-native"
import { Fragment } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

import { LoadingView } from "@/components/LoadingView"
import { LoginButton } from "@/components/LoginButton"
import { MiniPlayerWidget } from "@/components/MiniPlayerWidget"
import { ReadingSettings } from "@/components/ReadingSettings"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  useDeleteServerMutation,
  useGetGlobalPreferencesQuery,
  useListServersQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"
import { getDebugLoggingEnabled } from "@/store/selectors/loggingSelectors"
import { loggingSlice } from "@/store/slices/loggingSlice"

export default function Settings() {
  const { data: servers } = useListServersQuery()
  const [deleteServer] = useDeleteServerMutation()
  const [updatePreference] = useUpdateGlobalPreferenceMutation()
  const debugEnabled = useAppSelector(getDebugLoggingEnabled)
  const { data: preferences } = useGetGlobalPreferencesQuery()
  const dispatch = useAppDispatch()

  if (!preferences) return <LoadingView />

  return (
    <View className="flex-1 items-start px-6">
      <ScrollView className="w-full pt-4">
        <View>
          <Text variant="h2">Servers</Text>
          <View className="pt-4">
            {servers?.map((server) => {
              const serverUrl = new URL(server.baseUrl)
              const homepageUrl = new URL("/", serverUrl.origin)

              return (
                <Fragment key={server.uuid}>
                  <Text>
                    {server.username ? "Logged in" : "Logging in"} to:
                  </Text>
                  <Link className="mb-2" href={homepageUrl.toString()}>
                    <Text className="text-link">{serverUrl.hostname}</Text>
                  </Link>
                  <View>
                    {server.username ? (
                      <>
                        <Text>Logged in as:</Text>
                        <Text>{server.username}</Text>
                        <Button
                          variant="secondary"
                          className="my-2"
                          size="flex"
                          onPress={() => {
                            deleteServer({ uuid: server.uuid })
                          }}
                        >
                          <Text>Log out</Text>
                        </Button>
                      </>
                    ) : (
                      <LoginButton
                        serverUrl={homepageUrl.toString()}
                        serverUuid={server.uuid}
                      />
                    )}
                  </View>
                </Fragment>
              )
            })}
          </View>
          <Link href="/server" asChild>
            <Button variant="ghost" size="flex" onPress={() => {}}>
              <Icon as={PlusIcon} />
              <Text>Add server</Text>
            </Button>
          </Link>
        </View>
        <View className="mt-8">
          <Text variant="h2">Automatic Rewind</Text>
          <Text variant="p" className="text-sm">
            Storyteller can automatically rewind a few seconds after long breaks
            (a pause greater than five minutes) or audio interruptions (phone
            calls, voice assistants, navigation, etc.).
          </Text>
          <View className="my-3 w-full flex-row items-center gap-10">
            <Text maxFontSizeMultiplier={1} className="text-lg">
              Enabled
            </Text>
            <Switch
              checked={preferences.automaticRewind.enabled}
              onCheckedChange={(value) =>
                updatePreference({
                  name: "automaticRewind",
                  value: {
                    ...preferences.automaticRewind,
                    enabled: value,
                  },
                })
              }
            />
          </View>
          <View className="my-3 w-full flex-row items-center justify-between gap-4">
            <Text maxFontSizeMultiplier={1} className="text-lg">
              Long break
            </Text>
            <Slider
              disabled={!preferences.automaticRewind.enabled}
              className="h-4 grow"
              start={1}
              stop={30}
              step={1}
              value={preferences.automaticRewind.afterBreak}
              onValueChange={(value) => {
                updatePreference({
                  name: "automaticRewind",
                  value: {
                    ...preferences.automaticRewind,
                    // Rounding to hundredths to account for floating point errors
                    afterBreak: Math.round(value * 100) / 100,
                  },
                })
              }}
            />
            <Text maxFontSizeMultiplier={1} className="w-8 shrink-0 text-sm">
              {preferences.automaticRewind.afterBreak}s
            </Text>
          </View>
          <View className="my-3 w-full flex-row items-center justify-between gap-4">
            <Text maxFontSizeMultiplier={1} className="text-lg">
              Interruption
            </Text>
            <Slider
              disabled={!preferences.automaticRewind.enabled}
              className="h-4 grow"
              start={1}
              stop={30}
              step={1}
              value={preferences.automaticRewind.afterInterruption}
              onValueChange={(value) => {
                updatePreference({
                  name: "automaticRewind",
                  value: {
                    ...preferences.automaticRewind,
                    // Rounding to hundredths to account for floating point errors
                    afterInterruption: Math.round(value * 100) / 100,
                  },
                })
              }}
            />
            <Text maxFontSizeMultiplier={1} className="w-8 text-sm">
              {preferences.automaticRewind.afterInterruption}s
            </Text>
          </View>
        </View>
        <ReadingSettings />
        <View className="my-8 gap-4">
          <Text variant="h2">Logging</Text>
          <Button
            variant="secondary"
            size="flex"
            onPress={() => {
              dispatch(loggingSlice.actions.debugLoggingToggled())
            }}
          >
            <Text>{debugEnabled ? "Disable" : "Enable"} debug logging</Text>
          </Button>
          <Link href="/log" asChild>
            <Button size="flex" variant="ghost">
              <Text>View logs</Text>
            </Button>
          </Link>
          {/* Spacer for the miniplayer */}
          <View className="h-40 w-full" />
        </View>
      </ScrollView>
      <MiniPlayerWidget />
    </View>
  )
}
