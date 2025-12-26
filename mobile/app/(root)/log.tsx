import * as FileSystem from "expo-file-system/legacy"
import { useRouter } from "expo-router"
import { ChevronDownIcon } from "lucide-react-native"
import { useEffect, useState } from "react"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

import { LoadingView } from "@/components/LoadingView"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"

export default function LogModal() {
  const [logText, setLogText] = useState<string | null>(null)

  const router = useRouter()

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
            FileSystem.writeAsStringAsync(
              `${FileSystem.documentDirectory}storyteller-log`,
              "",
            )
          }}
        >
          <Text>Clear</Text>
        </Button>
      </View>
      <ScrollView className="grow">
        {logText === null && <LoadingView />}
        <Text selectable className="m-6 text-sm">
          {logText}
        </Text>
      </ScrollView>
    </View>
  )
}
