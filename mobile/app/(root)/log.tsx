import Clipboard from "@react-native-clipboard/clipboard"
import * as FileSystem from "expo-file-system/legacy"
import { useRouter } from "expo-router"
import { ChevronDownIcon } from "lucide-react-native"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { FlatList } from "react-native-gesture-handler"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"

export default function LogModal() {
  const [logText, setLogText] = useState<string[]>([])

  const router = useRouter()

  useEffect(() => {
    async function readLogText() {
      const today = new Date()
      const text = await FileSystem.readAsStringAsync(
        `${FileSystem.documentDirectory}storyteller-${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}.log`,
        {
          encoding: "utf8",
        },
      )
      setLogText(text.split("\n"))
    }

    const intervalId = setInterval(() => {
      readLogText()
    }, 3_000)

    readLogText()

    return () => {
      clearInterval(intervalId)
    }
  }, [])

  return (
    <View className="android:pt-safe h-full">
      <View className="w-full flex-row items-center justify-between px-4 pt-3">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => {
            router.back()
          }}
        >
          <Icon as={ChevronDownIcon} size={24} />
        </Button>
        <Button
          variant="ghost"
          className="self-end"
          onPress={() => {
            const today = new Date()
            FileSystem.writeAsStringAsync(
              `${FileSystem.documentDirectory}storyteller-${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}.log`,
              "",
            )
          }}
        >
          <Text>Clear</Text>
        </Button>
      </View>
      <View className="justify-center">
        <Button
          variant="ghost"
          onPress={() => {
            Clipboard.setString(logText.join("\n"))
          }}
        >
          <Text>Copy</Text>
        </Button>
      </View>
      <FlatList
        className="grow px-4"
        data={logText}
        renderItem={(item) => <Text>{item.item}</Text>}
      />
    </View>
  )
}
