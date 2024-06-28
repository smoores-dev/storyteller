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
import { UILink } from "../../../components/UILink"
import { Button, buttonStyles } from "../../../components/Button"
import { ReadingSettings } from "../../../components/ReadingSettings"

export default function Settings() {
  const { top } = useSafeAreaInsets()
  const apiBaseUrl = useAppSelector(getApiBaseUrl)
  const username = useAppSelector(getUsername)
  const debugEnabled = useAppSelector(getDebugLoggingEnabled)
  const dispatch = useAppDispatch()

  return (
    <View style={{ ...styles.container, paddingTop: top }}>
      <HeaderText style={styles.title}>Settings</HeaderText>
      <ScrollView>
        <View>
          {apiBaseUrl ? (
            <>
              <UIText>Logged in to:</UIText>
              <UIText>{apiBaseUrl}</UIText>
              <Button
                onPress={() => {
                  dispatch(apiSlice.actions.changeServerButtonTapped())
                }}
              >
                <UIText>Change server</UIText>
              </Button>
            </>
          ) : (
            <UILink style={buttonStyles.button} href="/server">
              Choose server
            </UILink>
          )}
        </View>
        {apiBaseUrl && (
          <View>
            {username ? (
              <>
                <UIText>Logged in as:</UIText>
                <UIText>{username}</UIText>
                <Button
                  onPress={() => {
                    dispatch(authSlice.actions.logoutButtonTapped())
                  }}
                >
                  <UIText>Log out</UIText>
                </Button>
              </>
            ) : (
              <Link href="/login" style={buttonStyles.button}>
                Log in
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
          <UILink href="log">View logs</UILink>
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
})
