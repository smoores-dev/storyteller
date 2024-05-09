import { Redirect } from "expo-router"

/**
 * Handles navigations from Android media player widgets,
 * which link to storyteller:///notification.click
 */
export default function NotificationClickRedirect() {
  return <Redirect href="/player" />
}
