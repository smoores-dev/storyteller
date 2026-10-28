import { useNavigation } from "expo-router"
import { useEffect, useState } from "react"
import { Platform, View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"

import Footnote from "@/components/Footnote"
import {
  readerFormSheetBottomPadding,
  readerFormSheetGrabberHeight,
  useReaderFormSheetBottomInset,
} from "@/components/toolbarItems/readerFormSheetLayout"
import { PortalHost } from "@/components/ui/portal-context"
import { useColorTheme } from "@/hooks/useColorTheme"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"

export default function FootnoteScreen() {
  const { foreground } = useColorTheme()
  const footnoteContent = useAppSelector(
    (state) => state.bookshelf.footnoteContent,
  )
  const [height, setHeight] = useState(0)
  const bottomInset = useReaderFormSheetBottomInset()
  const dispatch = useAppDispatch()
  const navigation = useNavigation()
  const scrollHeight =
    height -
    readerFormSheetGrabberHeight -
    readerFormSheetBottomPadding -
    bottomInset

  useEffect(() => {
    const unsubscribe = navigation.addListener("removed", () => {
      dispatch(bookshelfSlice.actions.footnoteClosed())
    })

    return () => queueMicrotask(unsubscribe)
  }, [dispatch, navigation])

  if (!footnoteContent) return null

  return (
    <View
      className="bg-background overflow-hidden"
      style={{ marginBottom: -bottomInset }}
      onLayout={(event) => {
        setHeight((prev) => prev ?? event.nativeEvent.layout.height)
      }}
    >
      <View
        className="items-center justify-center"
        style={{ height: readerFormSheetGrabberHeight }}
      >
        <View className="bg-muted-foreground/40 h-1 w-12 rounded-full" />
      </View>
      <PortalHost>
        <ScrollView
          style={{ height: scrollHeight }}
          contentContainerClassName="px-6 pb-20"
        >
          <View>
            <Footnote
              footnote={
                Platform.OS === "ios"
                  ? footnoteContent.replaceAll(/"/g, '\\"')
                  : footnoteContent
              }
              textColor={foreground}
              dom={{ matchContents: true }}
            />
          </View>
        </ScrollView>
      </PortalHost>
    </View>
  )
}
