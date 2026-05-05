import { Stack } from "expo-router"
import { Platform } from "react-native"
import { useReducedMotion } from "react-native-reanimated"

import { BackButton } from "@/components/BackButton"

export default function ModalLayout() {
  const modalPresentation = Platform.OS === "android" ? "formSheet" : "modal"
  const reduceMotion = useReducedMotion()

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        ...(reduceMotion ? { animation: "none" } : {}),
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: true,
          headerBackVisible: false,
          headerShadowVisible: false,
          headerLeft: () => <BackButton />,
          title: "Settings",
        }}
      />
      <Stack.Screen name="read/[uuid]" options={{ gestureEnabled: false }} />
      <Stack.Screen name="book/[uuid]" />
      <Stack.Screen name="shelf/[type]" />
      <Stack.Screen name="author/[uuid]" />
      <Stack.Screen
        name="server"
        options={{
          headerShown: true,
          headerBackVisible: false,
          headerShadowVisible: false,
          headerLeft: () => <BackButton fallback="/settings" />,
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
