import Constants from "expo-constants"
import { Link } from "expo-router"
import {
  BookOpenIcon,
  BugIcon,
  ExternalLinkIcon,
  PlusIcon,
} from "lucide-react-native"
import { Fragment } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

import { LoadingView } from "@/components/LoadingView"
import { LoginButton } from "@/components/LoginButton"
import { MiniPlayerWidget } from "@/components/MiniPlayerWidget"
import { ReadingSettings } from "@/components/ReadingSettings"
import { ScreenBackButton } from "@/components/ScreenBackButton"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { DiscordIcon } from "@/icons/DiscordIcon"
import { usesSystemHeader } from "@/lib/nativeChrome"
import {
  useDeleteServerMutation,
  useGetGlobalPreferencesQuery,
  useListServersQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"

export default function Settings() {
  const { data: servers } = useListServersQuery()
  const [deleteServer] = useDeleteServerMutation()
  const [updatePreference] = useUpdateGlobalPreferenceMutation()
  const { data: preferences } = useGetGlobalPreferencesQuery()

  if (!preferences) return <LoadingView />

  return (
    <View className="px-safe-or-6 flex-1 items-start">
      {/* Contributes header options, it does not render a view. */}
      <ScreenBackButton />
      <ScrollView
        className="w-full pt-4"
        contentInsetAdjustmentBehavior={
          usesSystemHeader ? "automatic" : "never"
        }
      >
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
                          accessibilityLabel={`Log out of ${serverUrl.hostname}`}
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
            <Button
              accessibilityLabel="Add server"
              variant="ghost"
              size="flex"
              onPress={() => {}}
            >
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
              accessibilityLabel="Automatic rewind enabled"
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
          <View className="my-3 w-full gap-2">
            <View className="w-full flex-row items-center justify-between gap-4">
              <Text maxFontSizeMultiplier={1} className="text-lg">
                Long break
              </Text>
              <Text maxFontSizeMultiplier={1} className="shrink-0 text-sm">
                {preferences.automaticRewind.afterBreak}s
              </Text>
            </View>
            <Slider
              accessibilityLabel="Automatic rewind after long break"
              disabled={!preferences.automaticRewind.enabled}
              className="w-full"
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
          </View>
          <View className="my-3 w-full gap-2">
            <View className="w-full flex-row items-center justify-between gap-4">
              <Text maxFontSizeMultiplier={1} className="text-lg">
                Interruption
              </Text>
              <Text maxFontSizeMultiplier={1} className="shrink-0 text-sm">
                {preferences.automaticRewind.afterInterruption}s
              </Text>
            </View>
            <Slider
              accessibilityLabel="Automatic rewind after interruption"
              disabled={!preferences.automaticRewind.enabled}
              className="w-full"
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
          </View>
        </View>
        <ReadingSettings />
        <View className="mt-8 gap-4">
          <Text variant="h2">Logging</Text>
          <Button
            accessibilityLabel={
              preferences.logLevel === "debug"
                ? "Disable debug logging"
                : "Enable debug logging"
            }
            variant="secondary"
            size="flex"
            onPress={() => {
              updatePreference({
                name: "logLevel",
                value:
                  preferences.logLevel === "debug"
                    ? __DEV__
                      ? "info"
                      : "error"
                    : "debug",
              })
            }}
          >
            <Text>
              {preferences.logLevel === "debug" ? "Disable" : "Enable"} debug
              logging
            </Text>
          </Button>
          <Link href="/log" asChild>
            <Button accessibilityLabel="View logs" size="flex" variant="ghost">
              <Text>View logs</Text>
            </Button>
          </Link>
        </View>
        <View className="my-8">
          <Text variant="h2">About</Text>

          <Text variant="p" className="text-muted-foreground mt-2 text-sm">
            Version {Constants.expoConfig?.version}
          </Text>

          <View className="mt-4 gap-3">
            <View className="flex-row items-center justify-start gap-2 rounded-lg">
              <Icon
                as={BookOpenIcon}
                size={20}
                className="text-foreground/50"
              />
              <Link
                href="https://storyteller-platform.dev/"
                className="ml-1 text-base"
              >
                <Text>Documentation</Text>
              </Link>
              <Icon
                as={ExternalLinkIcon}
                size={14}
                className="text-muted-foreground"
              />
            </View>

            <View className="flex-row items-center justify-start gap-2 rounded-lg">
              <Icon as={BugIcon} size={20} className="text-orange-500" />
              <Link
                href="https://gitlab.com/storyteller-platform/storyteller/-/issues/new?type=ISSUE"
                className="ml-1 text-base"
              >
                <Text>Report an issue</Text>
              </Link>
              <Icon
                as={ExternalLinkIcon}
                size={14}
                className="text-muted-foreground"
              />
            </View>

            <View className="flex-row items-center justify-start gap-2 rounded-lg">
              <DiscordIcon size={20} />
              <Link href="https://discord.gg/KhSvFqcrza" className="text-base">
                <Text>Join us on Discord</Text>
              </Link>
              <Icon
                as={ExternalLinkIcon}
                size={14}
                className="text-muted-foreground"
              />
            </View>
          </View>
        </View>

        <View className="h-40 w-full" />
      </ScrollView>
      <MiniPlayerWidget />
    </View>
  )
}
