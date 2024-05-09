import { Stack } from "expo-router"
import { useState } from "react"
import { TextInput, View, StyleSheet, Pressable } from "react-native"
import { UIText } from "../../../components/UIText"
import { useAppDispatch } from "../../../store/appState"
import { apiBaseUrlChanged } from "../../../store/slices/apiSlice"

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
  },
  label: {
    marginTop: 16,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  input: {
    padding: 16,
    borderColor: "#7A7B86",
    borderWidth: 1,
    borderRadius: 2,
    backgroundColor: "white",
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
    marginTop: 32,
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
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          textContentType="URL"
          value={url}
          onChangeText={setUrl}
        />
        <Pressable
          onPress={() => {
            dispatch(apiBaseUrlChanged({ baseUrl: url }))
          }}
          style={styles.button}
        >
          <UIText>Done</UIText>
        </Pressable>
      </View>
    </View>
  )
}
