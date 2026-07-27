import { useGlobalSearchParams } from "expo-router"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

import { ReadingSettings } from "@/components/ReadingSettings"
import {
  readerFormSheetBottomPadding,
  readerFormSheetGrabberHeight,
  useReaderFormSheetBottomInset,
  useReaderFormSheetHeight,
} from "@/components/toolbarItems/readerFormSheetLayout"
import { type UUID } from "@/uuid"

type ReadingSettingsParams = {
  uuid?: UUID
}

export default function ReadingSettingsScreen() {
  const { uuid } = useGlobalSearchParams<ReadingSettingsParams>()
  const height = useReaderFormSheetHeight()
  const bottomInset = useReaderFormSheetBottomInset()
  const scrollHeight =
    height -
    readerFormSheetGrabberHeight -
    readerFormSheetBottomPadding -
    bottomInset

  return (
    <View
      className="bg-background overflow-hidden"
      style={{ height, marginBottom: -bottomInset }}
    >
      <View
        className="items-center justify-center"
        style={{ height: readerFormSheetGrabberHeight }}
      >
        <View className="bg-muted-foreground/40 h-1 w-12 rounded-full" />
      </View>
      <ScrollView
        style={{ height: scrollHeight }}
        contentContainerClassName="px-6 pb-20"
      >
        <ReadingSettings {...(uuid ? { bookUuid: uuid } : {})} />
      </ScrollView>
    </View>
  )
}
