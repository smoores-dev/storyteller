import { Stack } from "expo-router"
import { useState } from "react"
import { View, StyleSheet } from "react-native"
import { UIText } from "../../../components/UIText"
import { useAppDispatch } from "../../../store/appState"
import { apiBaseUrlChanged } from "../../../store/slices/apiSlice"
import { TextInput } from "../../../components/ui/TextInput"
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
    marginTop: 16,
    marginHorizontal: 8,
  },
})

export default function LoginPage() {
  const dispatch = useAppDispatch()
  const [url, setUrl] = useState("")

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Select server",
        }}
      />
      <UIText style={styles.title}>Storyteller</UIText>
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
          onPress={() => {
            dispatch(apiBaseUrlChanged({ baseUrl: url }))
          }}
        >
          <UIText>Done</UIText>
        </Button>
      </View>
    </View>
  )
}
