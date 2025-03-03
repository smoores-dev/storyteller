import { Stack } from "expo-router"
import { useState } from "react"
import { View, StyleSheet } from "react-native"
import { TextInput } from "../../../components/ui/TextInput"
import { UIText } from "../../../components/UIText"
import { useAppDispatch } from "../../../store/appState"
import { loginButtonTapped } from "../../../store/slices/authSlice"
import { Button } from "../../../components/ui/Button"
import { spacing } from "../../../components/ui/tokens/spacing"

const styles = StyleSheet.create({
  container: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  title: {
    marginVertical: 64,
    fontSize: 32,
  },
  form: {
    width: "65%",
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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Login",
        }}
      />
      <UIText style={styles.title}>Storyteller</UIText>
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
          onPress={() => {
            dispatch(loginButtonTapped({ username, password }))
          }}
        >
          <UIText>Login</UIText>
        </Button>
      </View>
    </View>
  )
}
