import { Stack } from "expo-router"

export default function ModalLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="player"
        options={{
          presentation: "modal",
        }}
      />
      <Stack.Screen name="log" options={{ presentation: "modal" }} />
    </Stack>
  )
}
