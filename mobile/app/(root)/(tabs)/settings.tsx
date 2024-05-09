import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAppDispatch, useAppSelector } from "../../../store/appState"
import { getApiBaseUrl } from "../../../store/selectors/apiSelectors"
import { getUsername } from "../../../store/selectors/authSelectors"
import { ScrollView, View, StyleSheet, Pressable } from "react-native"
import { HeaderText } from "../../../components/HeaderText"
import { UIText } from "../../../components/UIText"
import { authSlice } from "../../../store/slices/authSlice"
import { Link } from "expo-router"
import { apiSlice } from "../../../store/slices/apiSlice"
import { getDebugLoggingEnabled } from "../../../store/selectors/loggingSelectors"
import { loggingSlice } from "../../../store/slices/loggingSlice"

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
              <Pressable
                style={styles.button}
                onPress={() => {
                  dispatch(apiSlice.actions.changeServerButtonTapped())
                }}
              >
                <UIText>Change server</UIText>
              </Pressable>
            </>
          ) : (
            <Link style={styles.button} href="/server">
              Choose server
            </Link>
          )}
        </View>
        {apiBaseUrl && (
          <View>
            {username ? (
              <>
                <UIText>Logged in as:</UIText>
                <UIText>{username}</UIText>
                <Pressable
                  style={styles.button}
                  onPress={() => {
                    dispatch(authSlice.actions.logoutButtonTapped())
                  }}
                >
                  <UIText>Log out</UIText>
                </Pressable>
              </>
            ) : (
              <Link href="/login" style={styles.button}>
                Log in
              </Link>
            )}
          </View>
        )}
        <View>
          <UIText style={styles.subheading}>Logging</UIText>
          <Pressable
            style={styles.button}
            onPress={() => {
              dispatch(loggingSlice.actions.debugLoggingToggled())
            }}
          >
            <UIText>{debugEnabled ? "Disable" : "Enable"} debug logging</UIText>
          </Pressable>
          <Link href="log">View logs</Link>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "flex-start",
    paddingLeft: 24,
  },
  title: {
    marginVertical: 32,
    fontSize: 32,
  },
  button: {
    backgroundColor: "#D0D0D7",
    color: "black",
    borderWidth: 1,
    borderRadius: 2,
    borderColor: "#7A7B86",
    paddingVertical: 12,
    paddingHorizontal: 16,
    display: "flex",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 32,
  },
  subheading: {
    fontSize: 24,
    fontWeight: "bold",
  },
})
