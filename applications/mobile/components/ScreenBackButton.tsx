import { Stack, useRouter } from "expo-router"

import { usesSystemHeader } from "@/lib/nativeChrome"

interface Props {
  fallback?: string
}

/**
 * The back action for screens hosted by the native stack.
 *
 * This contributes a *native* header item rather than a React view. That is the
 * difference that matters on iPhone Duo: iOS only rotates symbol-bearing system
 * items onto the vertical axis, so a `headerLeft` React view (a bar button item
 * with a custom view) pins the bar to the top of the screen instead of letting
 * the back action join the rail.
 *
 * Renders nothing on Android, where the screens keep their own JavaScript chrome.
 */
export function ScreenBackButton({ fallback = "/" }: Props) {
  const router = useRouter()

  if (!usesSystemHeader) {
    return null
  }

  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button
        accessibilityLabel="Go back"
        icon="chevron.backward"
        onPress={() => {
          if (router.canGoBack()) {
            router.back()
          } else {
            router.replace(fallback)
          }
        }}
      />
    </Stack.Toolbar>
  )
}
