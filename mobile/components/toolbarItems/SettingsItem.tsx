import { Portal } from "@rn-primitives/portal"
import { CaseSensitive } from "lucide-react-native"
import { useContext, useState } from "react"
import { Platform, View, useWindowDimensions } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { ReadingSettings } from "@/components/ReadingSettings"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { PortalContext } from "@/components/ui/portal-context"
import { Text } from "@/components/ui/text"
import { useAppSelector } from "@/store/appState"
import { getCurrentlyPlayingBookUuid } from "@/store/selectors/bookshelfSelectors"

export function SettingsItem() {
  const [isOpen, setIsOpen] = useState(false)
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const insets = useSafeAreaInsets()
  const dimensions = useWindowDimensions()
  const portalHostName = useContext(PortalContext)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="items-center rounded"
        onPress={() => {
          setIsOpen(true)
        }}
      >
        <Icon as={CaseSensitive} className="mt-0.5 -mb-0.5" size={24} />
      </Button>
      {isOpen && bookUuid && (
        <Portal name="reading-settings" hostName={portalHostName}>
          <View className="elevation border-secondary bg-background shadow-foreground absolute top-1/2 right-0 bottom-0 left-0 z-40 rounded-t border border-b-transparent px-6 py-4 shadow-sm">
            <Button variant="ghost" size="sm" className="self-end">
              <Text
                maxFontSizeMultiplier={1.2}
                className="text-primary pt-2 text-lg"
                onPress={() => {
                  setIsOpen(false)
                }}
              >
                Done
              </Text>
            </Button>
            <ScrollView
              style={{
                height:
                  dimensions.height / 2 -
                  (insets.top +
                    insets.bottom +
                    (Platform.OS === "android" ? 32 + 34 : 0)),
              }}
              contentContainerClassName="pb-20"
            >
              <ReadingSettings bookUuid={bookUuid} />
            </ScrollView>
          </View>
        </Portal>
      )}
    </>
  )
}
