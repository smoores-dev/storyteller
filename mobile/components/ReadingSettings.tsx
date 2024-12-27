import Slider from "@react-native-community/slider"
import { Pressable, StyleSheet, View } from "react-native"
import Select from "react-native-picker-select"
import { dequal } from "dequal"
import { appColor } from "../design"
import { formatNumber } from "../formatting"
import {
  defaultPreferences,
  preferencesSlice,
} from "../store/slices/preferencesSlice"
import { ButtonGroup, ButtonGroupButton } from "./ButtonGroup"
import { HighlightColorPicker } from "./HighlightColorPicker"
import { UIText } from "./UIText"
import { useColorTheme } from "../hooks/useColorTheme"
import { useAppDispatch, useAppSelector } from "../store/appState"
import {
  getFilledBookPreferences,
  getGlobalPreferences,
} from "../store/selectors/preferencesSelectors"
import { useMemo } from "react"

type Props = {
  bookId?: number
}

export function ReadingSettings({ bookId }: Props) {
  const globalPreferences = useAppSelector(getGlobalPreferences)
  const preferences = useAppSelector((state) =>
    bookId === undefined
      ? globalPreferences
      : getFilledBookPreferences(state, bookId),
  )

  const dirty = useMemo(
    () => dequal(globalPreferences, preferences),
    [globalPreferences, preferences],
  )

  const { foreground, dark } = useColorTheme()
  const dispatch = useAppDispatch()

  return (
    <View>
      <UIText style={styles.subheading}>Colors</UIText>
      <View style={styles.field}>
        <UIText style={styles.label}>Dark mode</UIText>
        <ButtonGroup
          value={preferences.darkMode}
          onChange={(value: boolean | "auto") =>
            dispatch(
              preferencesSlice.actions.globalPreferencesUpdated({
                darkMode: value,
              }),
            )
          }
        >
          <ButtonGroupButton value={false}>
            <UIText>Light</UIText>
          </ButtonGroupButton>
          <ButtonGroupButton value={"auto"}>
            <UIText>Device</UIText>
          </ButtonGroupButton>
          <ButtonGroupButton value={true}>
            <UIText>Dark</UIText>
          </ButtonGroupButton>
        </ButtonGroup>
      </View>
      <View style={styles.field}>
        <UIText style={styles.label}>Light theme</UIText>
        <Select
          darkTheme={dark}
          value={preferences.lightTheme}
          useNativeAndroidPickerStyle={false}
          onValueChange={(value) => {
            dispatch(
              preferencesSlice.actions.globalPreferencesUpdated({
                lightTheme: value,
              }),
            )
          }}
          items={preferences.colorThemes
            .filter(({ isDark }) => !isDark)
            .map(({ name }) => ({
              label: name,
              value: name,
            }))}
          style={{
            inputIOS: {
              color: foreground,
            },
            inputAndroid: {
              color: foreground,
            },
          }}
        />
      </View>
      <View style={styles.field}>
        <UIText style={styles.label}>Dark theme</UIText>
        <Select
          darkTheme={dark}
          value={preferences.darkTheme}
          useNativeAndroidPickerStyle={false}
          onValueChange={(value) => {
            dispatch(
              preferencesSlice.actions.globalPreferencesUpdated({
                darkTheme: value,
              }),
            )
          }}
          items={preferences.colorThemes
            .filter(({ isDark }) => isDark)
            .map(({ name }) => ({
              label: name,
              value: name,
            }))}
          style={{
            inputIOS: {
              color: foreground,
            },
            inputAndroid: {
              color: foreground,
            },
          }}
        />
      </View>
      <View
        style={[
          styles.field,
          { flexDirection: "column", alignItems: "flex-start" },
        ]}
      >
        <UIText style={styles.label}>Readaloud color</UIText>
        <HighlightColorPicker
          style={{ alignSelf: "flex-end" }}
          value={preferences.readaloudColor}
          onChange={(color) => {
            dispatch(
              preferencesSlice.actions.globalPreferencesUpdated({
                readaloudColor: color,
              }),
            )
          }}
        />
      </View>
      <View style={styles.typographyHeaderContainer}>
        <UIText style={styles.subsubheading}>
          Typography{!bookId && " defaults"}
        </UIText>
        {bookId ? (
          <Pressable
            disabled={dirty}
            onPress={() => {
              dispatch(
                preferencesSlice.actions.bookPreferencesSetAsDefaults({
                  bookId,
                }),
              )
            }}
          >
            <UIText style={dirty ? styles.disabled : styles.pressable}>
              Set as defaults
            </UIText>
          </Pressable>
        ) : (
          <Pressable
            disabled={preferences.typography === defaultPreferences.typography}
            onPress={() => {
              dispatch(preferencesSlice.actions.typographyPreferencesReset())
            }}
          >
            <UIText
              style={
                preferences.typography === defaultPreferences.typography
                  ? styles.disabled
                  : styles.pressable
              }
            >
              Reset
            </UIText>
          </Pressable>
        )}
      </View>

      <View style={styles.field}>
        <UIText style={[styles.label, { flexGrow: 1 }]}>Font scaling</UIText>
        <View style={styles.sliderWrapper}>
          <Slider
            style={styles.slider}
            minimumValue={0.7}
            maximumValue={1.5}
            step={0.05}
            value={preferences.typography.scale}
            minimumTrackTintColor={appColor}
            maximumTrackTintColor="#EAEAEA"
            thumbTintColor={appColor}
            onValueChange={(value) => {
              const update = {
                typography: {
                  ...preferences.typography,
                  // Rounding to hundredths to account for floating point errors
                  scale: Math.round(value * 100) / 100,
                },
              }
              const action = bookId
                ? preferencesSlice.actions.bookPreferencesUpdated({
                    bookId,
                    prefs: update,
                  })
                : preferencesSlice.actions.globalPreferencesUpdated(update)
              dispatch(action)
            }}
          />
          <UIText>{formatNumber(preferences.typography.scale, 2)}x</UIText>
        </View>
      </View>
      <View style={styles.field}>
        <UIText style={[styles.label, { flexGrow: 1 }]}>Line height</UIText>
        <View style={styles.sliderWrapper}>
          <Slider
            style={styles.slider}
            minimumValue={1.0}
            maximumValue={2.0}
            step={0.05}
            value={preferences.typography.lineHeight}
            minimumTrackTintColor={appColor}
            maximumTrackTintColor="#EAEAEA"
            thumbTintColor={appColor}
            onValueChange={(value) => {
              const update = {
                typography: {
                  ...preferences.typography,
                  // Rounding to hundredths to account for floating point errors
                  lineHeight: Math.round(value * 100) / 100,
                },
              }
              const action = bookId
                ? preferencesSlice.actions.bookPreferencesUpdated({
                    bookId,
                    prefs: update,
                  })
                : preferencesSlice.actions.globalPreferencesUpdated(update)
              dispatch(action)
            }}
          />
          <UIText>{formatNumber(preferences.typography.lineHeight, 2)}x</UIText>
        </View>
      </View>
      <View style={styles.field}>
        <UIText style={styles.label}>Text alignment</UIText>
        <ButtonGroup
          value={preferences.typography.alignment}
          onChange={(value: "justify" | "left") => {
            const update = {
              typography: {
                ...preferences.typography,
                alignment: value,
              },
            }
            const action = bookId
              ? preferencesSlice.actions.bookPreferencesUpdated({
                  bookId,
                  prefs: update,
                })
              : preferencesSlice.actions.globalPreferencesUpdated(update)
            dispatch(action)
          }}
        >
          <ButtonGroupButton value="justify">
            <UIText>Justify</UIText>
          </ButtonGroupButton>
          <ButtonGroupButton value="left">
            <UIText>Left</UIText>
          </ButtonGroupButton>
        </ButtonGroup>
      </View>
      <View style={styles.field}>
        <UIText style={styles.label}>Font family</UIText>
        <Select
          darkTheme={dark}
          value={preferences.typography.fontFamily}
          useNativeAndroidPickerStyle={false}
          onValueChange={(value) => {
            const update = {
              typography: {
                ...preferences.typography,
                fontFamily: value,
              },
            }
            const action = bookId
              ? preferencesSlice.actions.bookPreferencesUpdated({
                  bookId,
                  prefs: update,
                })
              : preferencesSlice.actions.globalPreferencesUpdated(update)
            dispatch(action)
          }}
          items={[{ label: "Bookerly", value: "Bookerly" }]}
          style={{
            inputIOS: {
              color: foreground,
            },
            inputAndroid: {
              color: foreground,
            },
          }}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  subsubheading: {
    fontSize: 22,
    fontWeight: "600",
    marginVertical: 12,
  },
  subheading: {
    fontSize: 24,
    fontWeight: "bold",
    marginVertical: 12,
  },
  field: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 12,
  },
  label: {
    fontSize: 18,
  },
  typographyHeaderContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pressable: {
    color: appColor,
  },
  disabled: {
    opacity: 0.6,
  },
  sliderWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexGrow: 3,
  },
  slider: { height: 16, flexBasis: 200 },
})
