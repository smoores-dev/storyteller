import { Link, useRouter } from "expo-router"
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react-native"
import { View } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable"

import { LoadingView } from "@/components/LoadingView"
import { Group } from "@/components/ui/Group"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import {
  useGetGlobalPreferencesQuery,
  useUpdateGlobalPreferenceMutation,
} from "@/store/localApi"

export default function CustomThemeListScreen() {
  const { data: preferences, isLoading } = useGetGlobalPreferencesQuery()
  const [updatePreference] = useUpdateGlobalPreferenceMutation()

  const router = useRouter()

  if (isLoading) return <LoadingView />

  if (!preferences) return null

  const { colorThemes } = preferences

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
        Custom themes
      </Text>
      <ScrollView className="mx-6 flex-1">
        <Link href="/custom-theme/new" asChild>
          <Button variant="ghost" className="h-20 sm:h-20">
            <Icon as={Plus} size={24} />
            <Text>New theme</Text>
          </Button>
        </Link>
        {colorThemes.map((theme, index) => (
          <Swipeable
            key={theme.name}
            renderRightActions={() => (
              <Button
                className="align-center h-full w-20 justify-center rounded-l-none bg-red-500 sm:h-full"
                variant="destructive"
                onPress={() => {
                  updatePreference({
                    name: "colorThemes",
                    value: colorThemes.filter((_, i) => i !== index),
                  })
                }}
              >
                <Icon as={Trash2} size={24} className="text-white" />
              </Button>
            )}
          >
            <Link
              href={{
                pathname: "/custom-theme/[name]",
                params: { name: theme.name },
              }}
              asChild
            >
              <Button variant="ghost" className="h-20 justify-start sm:h-20">
                <Group className="shrink-0 basis-1/2 items-center gap-4">
                  <Icon as={Pencil} size={16} />
                  <Text className="text-lg">{theme.name}</Text>
                </Group>
                <Group className="shrink-0 basis-1/2 gap-2">
                  <View
                    className="h-12 w-12 border border-gray-500"
                    style={{ backgroundColor: theme.foreground }}
                  />
                  <View
                    className="h-12 w-12 border border-gray-500"
                    style={{ backgroundColor: theme.background }}
                  />
                </Group>
              </Button>
            </Link>
          </Swipeable>
        ))}
      </ScrollView>
    </View>
  )
}
