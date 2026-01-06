import { Stack, useRouter } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import { Platform } from "react-native"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

export default function ModalLayout() {
  const modalPresentation = Platform.OS === "android" ? "formSheet" : "modal"

  const router = useRouter()

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: true,
          headerBackVisible: false,
          headerLeft: () => (
            <Button
              size="icon"
              variant="ghost"
              onPress={() => {
                router.replace("/")
              }}
            >
              <Icon as={ChevronLeft} size={24} />
            </Button>
          ),
          title: "Settings",
        }}
      />
      <Stack.Screen name="read/[uuid]" options={{ gestureEnabled: false }} />
      <Stack.Screen name="book/[uuid]" />
      <Stack.Screen name="author/[uuid]" />
      <Stack.Screen
        name="server"
        options={{
          headerShown: true,
          headerBackVisible: false,
          headerLeft: () => (
            <Button
              size="icon"
              variant="ghost"
              onPress={() => {
                router.replace("/settings")
              }}
            >
              <Icon as={ChevronLeft} size={24} />
            </Button>
          ),
          title: "Select server",
        }}
      />
      <Stack.Screen
        name="listen/[uuid]"
        options={{
          presentation: modalPresentation,
        }}
      />
      <Stack.Screen
        name="custom-theme/index"
        options={{
          presentation: modalPresentation,
        }}
      />
      <Stack.Screen
        name="custom-theme/new"
        options={{
          presentation: modalPresentation,
        }}
      />
      <Stack.Screen
        name="custom-theme/[name]"
        options={{
          presentation: modalPresentation,
        }}
      />
      <Stack.Screen
        name="custom-fonts"
        options={{
          presentation: modalPresentation,
        }}
      />
      <Stack.Screen
        name="log"
        options={{
          presentation: modalPresentation,
        }}
      />
    </Stack>
  )
}
