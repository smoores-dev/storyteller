import { File } from "expo-file-system"
import { useRouter } from "expo-router"
import { ChevronDown, Trash2 } from "lucide-react-native"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable"

import { FontLoader } from "@/components/FontLoader"
import { LoadingView } from "@/components/LoadingView"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import {
  useGetGlobalPreferencesQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"
import { getCustomFontUrl } from "@/store/persistence/fonts"

export default function CustomFontListScreen() {
  const { data: preferences, isLoading } = useGetGlobalPreferencesQuery()
  const [updatePreference] = useUpdateGlobalPreferenceMutation()

  const router = useRouter()

  if (isLoading) return <LoadingView />

  const customFonts = preferences?.customFonts ?? []

  return (
    <View className="android:pt-safe w-full flex-1">
      <View className="mb-2 w-full flex-row items-center px-4 pt-3">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => {
            router.back()
          }}
        >
          <Icon as={ChevronDown} size={24} />
        </Button>
      </View>
      <Text variant="h2" className="mx-6 mb-8 text-center">
        Custom fonts
      </Text>
      <ScrollView className="mx-6 flex-1">
        <FontLoader />
        {customFonts.map((font, index) => (
          <Swipeable
            key={font.name}
            renderRightActions={() => (
              <Button
                className="align-center h-full w-20 justify-center rounded-l-none bg-red-500 sm:h-full"
                variant="destructive"
                onPress={() => {
                  if (preferences?.typography.fontFamily === font.name) {
                    updatePreference({
                      name: "customFonts",
                      value: "Literata",
                    })
                  }
                  updatePreference({
                    name: "customFonts",
                    value: customFonts.filter((_, i) => i !== index),
                  })

                  new File(getCustomFontUrl(font.filename)).delete()
                }}
              >
                <Icon as={Trash2} size={24} className="text-white" />
              </Button>
            )}
          >
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1" className="bg-background">
                <AccordionTrigger>
                  <Text
                    className="text-lg select-none"
                    style={{ fontFamily: font.name }}
                  >
                    {font.name}
                  </Text>
                </AccordionTrigger>
                <AccordionContent>
                  <Text
                    className="text-sm select-none"
                    style={{ fontFamily: font.name }}
                  >
                    The quick brown fox jumps over the lazy dog.
                  </Text>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Swipeable>
        ))}
      </ScrollView>
    </View>
  )
}
