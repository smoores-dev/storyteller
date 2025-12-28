import { skipToken } from "@reduxjs/toolkit/query"
import deepmerge from "deepmerge"
import { dequal } from "dequal"
import { Link } from "expo-router"
import { useMemo } from "react"
import { Platform, Pressable, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { defaultPreferences } from "@/database/preferencesTypes"
import { formatNumber } from "@/formatting"
import { cn } from "@/lib/utils"
import {
  useGetBookPreferencesQuery,
  useGetGlobalPreferencesQuery,
  useSetBookPreferencesAsDefaultsMutation,
  useUpdateBookPreferenceMutation,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"
import { type UUID } from "@/uuid"

import { ColorPickerDialog } from "./ColorPickerDialog"
import { LoadingView } from "./LoadingView"
import { ButtonGroup, ButtonGroupButton } from "./ui/ButtonGroup"
import { Button } from "./ui/button"
import {
  NativeSelectScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Slider } from "./ui/slider"
import { Text } from "./ui/text"
import { colors } from "./ui/tokens/colors"
import { fontSizes } from "./ui/tokens/fontSizes"
import { spacing } from "./ui/tokens/spacing"

type Props = {
  bookUuid?: UUID
}

export function ReadingSettings({ bookUuid }: Props) {
  const { data: globalPreferences } = useGetGlobalPreferencesQuery()

  const { data: bookPreferences } = useGetBookPreferencesQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )

  const [updateGlobalPreference] = useUpdateGlobalPreferenceMutation()
  const [updateBookPreference] = useUpdateBookPreferenceMutation()
  const [setBookPreferencesAsDefaults] =
    useSetBookPreferencesAsDefaultsMutation()

  const preferences = useMemo(
    () =>
      bookPreferences
        ? globalPreferences && deepmerge(globalPreferences, bookPreferences)
        : globalPreferences,
    [globalPreferences, bookPreferences],
  )

  const dirty = useMemo(
    () => dequal(globalPreferences, preferences),
    [globalPreferences, preferences],
  )

  const typographyPreferencesAreDefaults = useMemo(
    () => dequal(preferences?.typography, defaultPreferences.typography),
    [preferences?.typography],
  )

  const insets = useSafeAreaInsets()
  const contentInsets = {
    top: insets.top,
    bottom: Platform.select({
      android: insets.bottom + 24,
      default: insets.bottom,
    }),
    left: 12,
    right: 12,
  }

  if (!preferences) return <LoadingView />

  return (
    <View className="mt-8">
      <Text variant="h2">Appearance</Text>
      <View className="my-3 w-full flex-row items-center justify-between">
        <Text maxFontSizeMultiplier={1} className="text-lg">
          Dark mode
        </Text>
        <ButtonGroup
          value={preferences.darkMode}
          onChange={(value: boolean | "auto") => {
            updateGlobalPreference({ name: "darkMode", value })
          }}
        >
          <ButtonGroupButton value={false}>
            <Text maxFontSizeMultiplier={1}>Light</Text>
          </ButtonGroupButton>
          <ButtonGroupButton value="auto">
            <Text maxFontSizeMultiplier={1}>Device</Text>
          </ButtonGroupButton>
          <ButtonGroupButton value={true}>
            <Text maxFontSizeMultiplier={1}>Dark</Text>
          </ButtonGroupButton>
        </ButtonGroup>
      </View>
      <View className="my-3 w-full flex-row items-center justify-between">
        <Text className="text-lg">Light theme</Text>
        <Select
          value={{
            value: preferences.lightTheme,
            label: preferences.lightTheme,
          }}
          onValueChange={(option) => {
            if (!option) return
            updateGlobalPreference({ name: "lightTheme", value: option.value })
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent insets={contentInsets}>
            <NativeSelectScrollView>
              {preferences.colorThemes
                .filter(({ isDark }) => !isDark)
                .map(({ name }) => (
                  <SelectItem key={name} label={name} value={name} />
                ))}
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </View>
      <View className="my-3 w-full flex-row items-center justify-between">
        <Text className="text-lg">Dark theme</Text>
        <Select
          value={{
            value: preferences.darkTheme,
            label: preferences.darkTheme,
          }}
          onValueChange={(option) => {
            if (!option) return
            updateGlobalPreference({ name: "darkTheme", value: option.value })
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent insets={contentInsets}>
            <NativeSelectScrollView>
              {preferences.colorThemes
                .filter(({ isDark }) => isDark)
                .map(({ name }) => (
                  <SelectItem key={name} label={name} value={name} />
                ))}
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </View>
      <Link href="/custom-theme" asChild>
        <Button size="flex" variant="ghost">
          <Text className="text-primary group-active:text-primary/80">
            Manage custom themes
          </Text>
        </Button>
      </Link>
      <View className="my-3 w-full flex-col items-start">
        <Text className="text-lg">Readaloud color</Text>
        <ColorPickerDialog
          key={preferences.readaloudColor}
          initialValue={preferences.readaloudColor}
          onSave={(value) => {
            updateGlobalPreference({ name: "readaloudColor", value })
          }}
        />
      </View>
      <View>
        <Text variant="h2">Typography{!bookUuid && " defaults"}</Text>
        {bookUuid ? (
          <View style={styles.typographyControls}>
            <Button
              disabled={dirty}
              variant="ghost"
              size="sm"
              onPress={() => {
                setBookPreferencesAsDefaults({ bookUuid })
              }}
            >
              <Text
                maxFontSizeMultiplier={1.5}
                className={dirty ? "opacity-50" : "text-primary"}
              >
                Set as defaults
              </Text>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={typographyPreferencesAreDefaults}
              onPress={() => {
                updateBookPreference({
                  bookUuid,
                  name: "typography",
                  value: {},
                })
              }}
            >
              <Text
                maxFontSizeMultiplier={1.5}
                className={
                  typographyPreferencesAreDefaults
                    ? "opacity-50"
                    : "text-primary"
                }
              >
                Reset to defaults
              </Text>
            </Button>
          </View>
        ) : (
          <Pressable
            disabled={typographyPreferencesAreDefaults}
            onPress={() => {
              updateGlobalPreference({
                name: "typography",
                value: defaultPreferences.typography,
              })
            }}
          >
            <Text
              className={cn(
                "my-2 self-end",
                typographyPreferencesAreDefaults
                  ? "opacity-50"
                  : "text-primary",
              )}
            >
              Reset
            </Text>
          </Pressable>
        )}
      </View>

      <View className="my-3 w-full flex-row items-center justify-between gap-4">
        <Text maxFontSizeMultiplier={1} className="text-lg">
          Font scaling
        </Text>
        <Slider
          className="h-2 grow"
          start={0.7}
          stop={2}
          step={0.05}
          value={preferences.typography.scale}
          onValueChange={(value) => {
            const update = {
              ...preferences.typography,
              // Rounding to hundredths to account for floating point errors
              scale: Math.round(value * 100) / 100,
            }
            if (bookUuid) {
              updateBookPreference({
                bookUuid,
                name: "typography",
                value: update,
              })
            } else {
              updateGlobalPreference({ name: "typography", value: update })
            }
          }}
        />
        <Text className="text-sm" maxFontSizeMultiplier={1}>
          {formatNumber(preferences.typography.scale, 2)}x
        </Text>
      </View>
      <View className="my-3 w-full flex-row items-center justify-between gap-4">
        <Text maxFontSizeMultiplier={1} className="text-lg">
          Line height
        </Text>
        <Slider
          className="h-2 grow"
          start={1.0}
          stop={2.0}
          step={0.05}
          value={preferences.typography.lineHeight}
          onValueChange={(value) => {
            const update = {
              ...preferences.typography,
              // Rounding to hundredths to account for floating point errors
              lineHeight: Math.round(value * 100) / 100,
            }
            if (bookUuid) {
              updateBookPreference({
                bookUuid,
                name: "typography",
                value: update,
              })
            } else {
              updateGlobalPreference({ name: "typography", value: update })
            }
          }}
        />
        <Text maxFontSizeMultiplier={1} className="text-sm">
          {formatNumber(preferences.typography.lineHeight, 2)}x
        </Text>
      </View>
      <View style={styles.field}>
        <Text maxFontSizeMultiplier={1} className="text-lg">
          Text alignment
        </Text>
        <ButtonGroup
          value={preferences.typography.alignment}
          onChange={(value: "justify" | "left") => {
            const update = {
              ...preferences.typography,
              alignment: value,
            }
            if (bookUuid) {
              updateBookPreference({
                bookUuid,
                name: "typography",
                value: update,
              })
            } else {
              updateGlobalPreference({ name: "typography", value: update })
            }
          }}
        >
          <ButtonGroupButton value="justify">
            <Text maxFontSizeMultiplier={1}>Justify</Text>
          </ButtonGroupButton>
          <ButtonGroupButton value="left">
            <Text maxFontSizeMultiplier={1}>Left</Text>
          </ButtonGroupButton>
        </ButtonGroup>
      </View>
      <View style={styles.field}>
        <Text maxFontSizeMultiplier={1.25} className="text-lg">
          Font family
        </Text>
        <Select
          value={{
            value: preferences.typography.fontFamily,
            label: preferences.typography.fontFamily,
          }}
          onValueChange={(option) => {
            if (!option) return
            const update = {
              ...preferences.typography,
              fontFamily: option.value,
            }
            if (bookUuid) {
              updateBookPreference({
                bookUuid,
                name: "typography",
                value: update,
              })
            } else {
              updateGlobalPreference({ name: "typography", value: update })
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent insets={contentInsets}>
            <NativeSelectScrollView>
              <SelectItem label="Literata" value="Literata">
                <Text
                  className="select-none text-sm"
                  style={{ fontFamily: "Literata_500Medium" }}
                >
                  Literata
                </Text>
              </SelectItem>
              <SelectItem label="OpenDyslexic" value="OpenDyslexic">
                <Text
                  className="select-none text-sm"
                  style={{ fontFamily: "OpenDyslexic-Regular" }}
                >
                  OpenDyslexic
                </Text>
              </SelectItem>
              {preferences.customFonts.map(({ name }) => (
                <SelectItem key={name} label={name} value={name}>
                  <Text
                    className="select-none text-sm"
                    style={{ fontFamily: name }}
                  >
                    {name}
                  </Text>
                </SelectItem>
              ))}
            </NativeSelectScrollView>
          </SelectContent>
        </Select>
      </View>
      <Link href="custom-fonts" asChild>
        <Button size="flex" variant="ghost">
          <Text className="text-primary group-active:text-primary/80">
            Manage custom fonts
          </Text>
        </Button>
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  subsubheading: {
    ...fontSizes.xl,
    fontWeight: "600",
    marginVertical: spacing["1.5"],
  },
  subheading: {
    ...fontSizes["2xl"],
    fontWeight: "bold",
    marginVertical: spacing["1.5"],
  },
  explanation: {
    ...fontSizes.xs,
  },
  field: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: spacing["1.5"],
  },
  label: {
    ...fontSizes.lg,
    flexGrow: 0,
  },
  typographyHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  bookTypographyHeaderContainer: {},
  typographyControls: { flexDirection: "row", justifyContent: "space-between" },
  pressable: {
    color: colors.primary9,
  },
  disabled: {
    opacity: 0.6,
  },
})
