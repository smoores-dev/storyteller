import { Stack, withLayoutContext } from "expo-router"
import {
  // Import the creation function
  createStackNavigator,
  // Import the types
  StackNavigationOptions,
  TransitionPresets,
} from "@react-navigation/stack"
import { EventMapBase, NavigationState } from "@react-navigation/native"
import { Platform } from "react-native"

const { Navigator } = createStackNavigator()

export const JsStack = withLayoutContext<
  StackNavigationOptions,
  typeof Navigator,
  NavigationState,
  EventMapBase
>(Navigator)

export default function ModalLayout() {
  // iOS has native modal screens, so on iOS we can use the native stack
  // and simple modal presentation
  if (Platform.OS === "ios") {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="player"
          options={{
            presentation: Platform.isPad ? "fullScreenModal" : "modal",
          }}
        />
        <Stack.Screen
          name="log"
          options={{ presentation: "fullScreenModal" }}
        />
      </Stack>
    )
  }

  // Android doesn't have any analog to iOS's full screen modal
  // sheet, so on Android we fall back to the legacy JS stack
  return (
    <JsStack screenOptions={{ headerShown: false }}>
      <JsStack.Screen
        name="player"
        options={{
          presentation: "modal",
          gestureEnabled: true,
          ...TransitionPresets.ModalPresentationIOS,
        }}
      />
      <JsStack.Screen
        name="log"
        options={{
          presentation: "modal",
          gestureEnabled: true,
          ...TransitionPresets.ModalPresentationIOS,
        }}
      />
    </JsStack>
  )
}
