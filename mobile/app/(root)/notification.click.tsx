import { Redirect } from "expo-router"

import { useAppSelector } from "@/store/appState"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
} from "@/store/selectors/bookshelfSelectors"

/**
 * Handles navigations from Android media player widgets,
 * which link to storyteller:///notification.click
 */
export default function NotificationClickRedirect() {
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const format = useAppSelector(getCurrentlyPlayingFormat)

  return (
    <Redirect
      href={{ pathname: "/listen/[uuid]", params: { uuid: bookUuid, format } }}
    />
  )
}
