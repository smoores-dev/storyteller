import { useEffect, useState } from "react"
import { ScrollView, StyleSheet } from "react-native"
import { LoadingView } from "../../components/LoadingView"
import * as FileSystem from "expo-file-system"
import { UIText } from "../../components/UIText"

export default function LogModal() {
  const [logText, setLogText] = useState<string | null>(null)

  useEffect(() => {
    async function readLogText() {
      const text = await FileSystem.readAsStringAsync(
        `${FileSystem.documentDirectory}storyteller-log`,
        {
          encoding: "utf8",
        },
      )
      setLogText(text)
    }

    const intervalId = setInterval(() => {
      readLogText()
    }, 3000)

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  return (
    <ScrollView style={styles.container}>
      {logText === null && <LoadingView />}
      <UIText
        style={styles.clear}
        onPress={() => {
          FileSystem.writeAsStringAsync(
            `${FileSystem.documentDirectory}storyteller-log`,
            "",
          )
        }}
      >
        Clear
      </UIText>
      <UIText>{logText}</UIText>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  clear: {
    alignSelf: "flex-end",
    marginBottom: 24,
  },
})
