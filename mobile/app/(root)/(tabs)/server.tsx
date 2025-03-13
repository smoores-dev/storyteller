import { Stack } from "expo-router"
import { useState } from "react"
import { View, StyleSheet } from "react-native"
import { UIText } from "../../../components/UIText"
import { useAppDispatch } from "../../../store/appState"
import { apiBaseUrlChanged } from "../../../store/slices/apiSlice"
import { TextInput } from "../../../components/ui/TextInput"
import { Button } from "../../../components/ui/Button"
import { spacing } from "../../../components/ui/tokens/spacing"
import { useColorTheme } from "../../../hooks/useColorTheme"
import { fontSizes } from "../../../components/ui/tokens/fontSizes"
import { HeaderText } from "../../../components/HeaderText"

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
    gap: spacing[2],
    paddingBottom: spacing[2],
  },
  label: {
    marginHorizontal: 8,
  },
})

export default function LoginPage() {
  const dispatch = useAppDispatch()
  const [url, setUrl] = useState("")
  const { surface } = useColorTheme()

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Select server",
        }}
      />
      <HeaderText style={styles.title}>Server</HeaderText>
      <View style={styles.form}>
        <UIText style={styles.label}>Server url</UIText>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          textContentType="URL"
          value={url}
          onChangeText={setUrl}
        />
        <Button
          variant="primary"
          onPress={() => {
            dispatch(apiBaseUrlChanged({ baseUrl: url }))
          }}
        >
          <UIText>Done</UIText>
        </Button>
      </View>
      <View
        style={{
          gap: spacing[2],
          padding: spacing[2],
          backgroundColor: surface,
          borderRadius: spacing.borderRadius,
        }}
      >
        <UIText style={fontSizes.base}>
          Enter the full URL for your Storyteller server instance, including the
          scheme (http:// or https://).
        </UIText>
        <UIText style={fontSizes.base}>
          This may look like a local IP address and port, such as:
        </UIText>
        <UIText style={fontSizes.base}>http://192.168.1.12:8001</UIText>
        <UIText style={fontSizes.base}>Or a domain name, such as:</UIText>
        <UIText style={fontSizes.base}>https://yourdomain.com</UIText>
      </View>
    </View>
  )
}
