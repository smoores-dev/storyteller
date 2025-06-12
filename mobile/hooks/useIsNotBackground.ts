import { useEffect, useState } from "react"
import { AppState } from "react-native"

function notBackground(state: typeof AppState.currentState) {
  return state === "active" || state === "inactive"
}

/**
 * Returns true if AppState is either 'active' or 'inactive'
 *
 * App States:
 *      active - The app is running in the foreground
 *      background - The app is running in the background. The user is either in another app or on the home screen
 *      inactive [iOS] - This is a transition state that happens when the app launches, is asking for permissions or when a call or SMS message is received.
 *      unknown [iOS] - Initial value until the current app state is determined
 *      extension [iOS] - The app is running as an app extension
 */
export function useIsNotBackground() {
  const [result, setResult] = useState(notBackground(AppState.currentState))

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      setResult(notBackground(nextAppState))
    })

    return () => {
      subscription.remove()
    }
  }, [])

  return result
}
