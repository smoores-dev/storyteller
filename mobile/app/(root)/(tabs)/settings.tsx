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

export default function Settings() {
  const { top } = useSafeAreaInsets()
  const apiBaseUrl = useAppSelector(getApiBaseUrl)
  const username = useAppSelector(getUsername)
  const debugEnabled = useAppSelector(getDebugLoggingEnabled)
  const dispatch = useAppDispatch()

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
                <UIText style={{ color: colors.blue8 }}>
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
})
