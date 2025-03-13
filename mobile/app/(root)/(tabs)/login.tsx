import { Link, Stack } from "expo-router"
import { useState } from "react"
import { View, StyleSheet } from "react-native"
import { TextInput } from "../../../components/ui/TextInput"
import { UIText } from "../../../components/UIText"
import { useAppDispatch, useAppSelector } from "../../../store/appState"
import { loginButtonTapped } from "../../../store/slices/authSlice"
import { Button } from "../../../components/ui/Button"
import { spacing } from "../../../components/ui/tokens/spacing"
import { HeaderText } from "../../../components/HeaderText"
import { fontSizes } from "../../../components/ui/tokens/fontSizes"
import { useColorTheme } from "../../../hooks/useColorTheme"
import { getApiBaseUrl } from "../../../store/selectors/apiSelectors"
import { colors } from "../../../components/ui/tokens/colors"

const styles = StyleSheet.create({
  container: {
    flex: 1,
    display: "flex",
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingHorizontal: spacing[4],
  },
  title: {
    marginTop: spacing[8],
    marginBottom: spacing[5],
    ...fontSizes["3xl"],
  },
  form: {
    paddingTop: spacing[2],
    gap: spacing[2],
  },
  label: {
    marginHorizontal: 8,
  },
  input: {
    padding: 16,
    borderColor: "#7A7B86",
    borderWidth: 1,
    borderRadius: 2,
    backgroundColor: "white",
  },
})

export default function LoginPage() {
  const dispatch = useAppDispatch()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const apiBaseUrl = useAppSelector(getApiBaseUrl)

  const apiUrl = apiBaseUrl && new URL(apiBaseUrl)
  const homepageUrl =
    apiUrl && new URL(apiUrl.pathname.replace("/api", ""), apiUrl.origin)

  const { dark } = useColorTheme()

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Login",
        }}
      />
      <HeaderText style={styles.title}>Login</HeaderText>
      <View
        style={{
          alignItems: "stretch",
          justifyContent: "flex-start",
        }}
      >
        {homepageUrl && (
          <>
            <UIText>Logging in to:</UIText>
            <Link
              style={{ marginBottom: spacing[1] }}
              href={homepageUrl.toString() ?? ""}
            >
              <UIText style={{ color: dark ? colors.blue3 : colors.blue8 }}>
                {apiUrl.hostname}
                {apiUrl.pathname.replace("/api", "")}
              </UIText>
            </Link>
          </>
        )}

        <View style={styles.form}>
          <UIText style={styles.label}>username</UIText>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            textContentType="username"
            value={username}
            onChangeText={setUsername}
          />
          <UIText style={styles.label}>password</UIText>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />
          <Button
            variant="primary"
            onPress={() => {
              dispatch(loginButtonTapped({ username, password }))
            }}
          >
            <UIText>Login</UIText>
          </Button>
        </View>
      </View>
    </View>
  )
}
