import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAppDispatch, useAppSelector } from "../../../store/appState"
import { getApiBaseUrl } from "../../../store/selectors/apiSelectors"
import { getUsername } from "../../../store/selectors/authSelectors"
import { ScrollView, View, StyleSheet } from "react-native"
import { HeaderText } from "../../../components/HeaderText"
import { UIText } from "../../../components/UIText"
import { authSlice } from "../../../store/slices/authSlice"
import { Link } from "expo-router"
import { apiSlice } from "../../../store/slices/apiSlice"
import { getDebugLoggingEnabled } from "../../../store/selectors/loggingSelectors"
import { loggingSlice } from "../../../store/slices/loggingSlice"
import { Button } from "../../../components/ui/Button"
import { ReadingSettings } from "../../../components/ReadingSettings"
import { spacing } from "../../../components/ui/tokens/spacing"
import { colors } from "../../../components/ui/tokens/colors"
import { useColorTheme } from "../../../hooks/useColorTheme"
import { fontSizes } from "../../../components/ui/tokens/fontSizes"
import {
  ButtonGroup,
  ButtonGroupButton,
} from "../../../components/ui/ButtonGroup"
import { preferencesSlice } from "../../../store/slices/preferencesSlice"
import { getGlobalPreferences } from "../../../store/selectors/preferencesSelectors"
import { Slider } from "../../../components/ui/Slider"

export default function Settings() {
  const { top } = useSafeAreaInsets()
  const apiBaseUrl = useAppSelector(getApiBaseUrl)
  const username = useAppSelector(getUsername)
  const debugEnabled = useAppSelector(getDebugLoggingEnabled)
  const preferences = useAppSelector(getGlobalPreferences)
  const dispatch = useAppDispatch()

  const { dark } = useColorTheme()

  const apiUrl = apiBaseUrl && new URL(apiBaseUrl)
  const homepageUrl =
    apiUrl && new URL(apiUrl.pathname.replace("/api", ""), apiUrl.origin)

  return (
    <View style={{ ...styles.container, paddingTop: top }}>
      <HeaderText style={styles.title}>Settings</HeaderText>
      <ScrollView style={styles.scrollview}>
        <View>
          {homepageUrl ? (
            <>
              <UIText>{username ? "Logged in" : "Logging in"} to:</UIText>
              <Link
                style={{ marginBottom: spacing[1] }}
                href={homepageUrl.toString()}
              >
                <UIText style={{ color: dark ? colors.blue3 : colors.blue8 }}>
                  {apiUrl.hostname}
                  {apiUrl.pathname.replace("/api", "")}
                </UIText>
              </Link>
              <Button
                style={styles.button}
                onPress={() => {
                  dispatch(apiSlice.actions.changeServerButtonTapped())
                }}
              >
                <UIText>Change server</UIText>
              </Button>
            </>
          ) : (
            <Link href="/server" asChild>
              <Button>
                <UIText>Choose server</UIText>
              </Button>
            </Link>
          )}
        </View>
        {apiBaseUrl && (
          <View>
            {username ? (
              <>
                <UIText>Logged in as:</UIText>
                <UIText>{username}</UIText>
                <Button
                  style={styles.button}
                  onPress={() => {
                    dispatch(authSlice.actions.logoutButtonTapped())
                  }}
                >
                  <UIText>Log out</UIText>
                </Button>
              </>
            ) : (
              <Link href="/login" asChild>
                <Button>
                  <UIText>Log in</UIText>
                </Button>
              </Link>
            )}
          </View>
        )}
        <View>
          <UIText style={styles.subheading}>Automatic Rewind</UIText>
          <UIText style={styles.explanation}>
            Storyteller can automatically rewind a few seconds after long breaks
            (a pause greater than five minutes) or audio interruptions (phone
            calls, voice assistants, navigation, etc.).
          </UIText>
          <View style={styles.field}>
            <ButtonGroup
              value={preferences.automaticRewind.enabled}
              onChange={(value) =>
                dispatch(
                  preferencesSlice.actions.globalPreferencesUpdated({
                    automaticRewind: {
                      ...preferences.automaticRewind,
                      enabled: value,
                    },
                  }),
                )
              }
            >
              <ButtonGroupButton value={true}>
                <UIText>Enable</UIText>
              </ButtonGroupButton>
              <ButtonGroupButton value={false}>
                <UIText>Disable</UIText>
              </ButtonGroupButton>
            </ButtonGroup>
          </View>
          <View style={[styles.field, { gap: spacing[2] }]}>
            <UIText style={styles.label}>Long break</UIText>
            <Slider
              style={styles.slider}
              start={1}
              stop={30}
              step={1}
              value={preferences.automaticRewind.afterBreak}
              onValueChange={(value) => {
                dispatch(
                  preferencesSlice.actions.globalPreferencesUpdated({
                    automaticRewind: {
                      ...preferences.automaticRewind,
                      // Rounding to hundredths to account for floating point errors
                      afterBreak: Math.round(value * 100) / 100,
                    },
                  }),
                )
              }}
            />
            <UIText style={{ flexBasis: 30 }}>
              {preferences.automaticRewind.afterBreak}s
            </UIText>
          </View>
          <View style={[styles.field, { gap: spacing[2] }]}>
            <UIText style={styles.label}>Interruption</UIText>
            <Slider
              style={styles.slider}
              start={1}
              stop={30}
              step={1}
              value={preferences.automaticRewind.afterInterruption}
              onValueChange={(value) => {
                dispatch(
                  preferencesSlice.actions.globalPreferencesUpdated({
                    automaticRewind: {
                      ...preferences.automaticRewind,
                      // Rounding to hundredths to account for floating point errors
                      afterInterruption: Math.round(value * 100) / 100,
                    },
                  }),
                )
              }}
            />
            <UIText style={{ flexBasis: 30 }}>
              {preferences.automaticRewind.afterInterruption}s
            </UIText>
          </View>
        </View>
        <ReadingSettings />
        <View>
          <UIText style={styles.subheading}>Logging</UIText>
          <Button
            onPress={() => {
              dispatch(loggingSlice.actions.debugLoggingToggled())
            }}
          >
            <UIText>{debugEnabled ? "Disable" : "Enable"} debug logging</UIText>
          </Button>
          <Link href="/log">
            <UIText>View logs</UIText>
          </Link>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: "#fff",
    alignItems: "flex-start",
    paddingHorizontal: 24,
  },
  title: {
    marginVertical: 32,
    fontSize: 32,
  },
  subheading: {
    fontSize: 24,
    fontWeight: "bold",
    marginVertical: 12,
  },
  scrollview: {
    width: "100%",
  },
  button: {
    marginVertical: spacing[1],
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
  slider: { height: spacing[2], flexGrow: 1 },
})
