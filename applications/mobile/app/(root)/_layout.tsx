import { Stack } from "expo-router"
import { Platform } from "react-native"
import { useReducedMotion } from "react-native-reanimated"

import { BackButton } from "@/components/BackButton"
import { useAppDispatch } from "@/store/appState"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"

export default function ModalLayout() {
  const modalPresentation = Platform.OS === "android" ? "formSheet" : "modal"
  const reduceMotion = useReducedMotion()
  const dispatch = useAppDispatch()

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
      <Stack.Screen
        name="navigation-menu"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: false,
          sheetLargestUndimmedDetentIndex: "none",
        }}
      />
      <Stack.Screen
        name="speed-menu"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: false,
          sheetLargestUndimmedDetentIndex: "none",
        }}
      />
      <Stack.Screen
        name="reading-settings"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: false,
          sheetLargestUndimmedDetentIndex: "none",
        }}
      />
      <Stack.Screen
        name="footnote"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: false,
          sheetLargestUndimmedDetentIndex: "last",
        }}
        listeners={{
          beforeRemove: () => {
            dispatch(bookshelfSlice.actions.footnoteClosed())
          },
        }}
      />
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
          sheetShouldOverflowTopInset: true,
        }}
      />
      <Stack.Screen
        name="custom-theme/index"
        options={{
          presentation: modalPresentation,
          sheetShouldOverflowTopInset: true,
        }}
      />
      <Stack.Screen
        name="custom-theme/new"
        options={{
          presentation: modalPresentation,
          sheetShouldOverflowTopInset: true,
        }}
      />
      <Stack.Screen
        name="custom-theme/[name]"
        options={{
          presentation: modalPresentation,
          sheetShouldOverflowTopInset: true,
        }}
      />
      <Stack.Screen
        name="custom-fonts"
        options={{
          presentation: modalPresentation,
          sheetShouldOverflowTopInset: true,
        }}
      />
      <Stack.Screen
        name="log"
        options={{
          presentation: modalPresentation,
          sheetShouldOverflowTopInset: true,
        }}
      />
    </Stack>
  )
}
