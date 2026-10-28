import { skipToken } from "@reduxjs/toolkit/query"
import { Link } from "expo-router"
import { BookOpen, Headphones } from "lucide-react-native"
import { View } from "react-native"

import { type Bookmark } from "@/database/bookmarks"
import { cn } from "@/lib/utils"
import { useAppSelector } from "@/store/appState"
import { useGetBookQuery } from "@/store/localApi"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
} from "@/store/selectors/bookshelfSelectors"

import { BookmarkItem } from "./toolbarItems/BookmarkItem"
import { LayoutItem } from "./toolbarItems/LayoutItem"
import { NavigationItem } from "./toolbarItems/NavigationItem"
import { SettingsItem } from "./toolbarItems/SettingsItem"
import { SleepTimerItem } from "./toolbarItems/SleepTimerItem"
import { SpeedItem } from "./toolbarItems/SpeedItem"
import { Button } from "./ui/button"
import { Icon } from "./ui/icon"

type Props = {
  mode: "audio" | "text"
  activeBookmarks: Bookmark[]
  /**
   * Stack the items for the vertical rail instead of laying them out in a bar.
   */
  vertical?: boolean
}

export function Toolbar({ mode, activeBookmarks, vertical = false }: Props) {
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const selectedFormat = useAppSelector(getCurrentlyPlayingFormat)
  const format = selectedFormat ?? "readaloud"

  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )
  if (!book) return null

  return (
    <>
      <View
        className={cn("items-center gap-1", vertical ? "flex-col" : "flex-row")}
      >
        {mode === "text" && <LayoutItem />}
        {mode === "text" && <SettingsItem />}
        {mode === "audio" && <SleepTimerItem />}
        {mode === "text" &&
          (vertical ? (
            <SleepTimerItem />
          ) : (
            // In a bar there is not always room for the sleep timer as well.
            <View className="xs:flex hidden">
              <SleepTimerItem />
            </View>
          ))}
        <SpeedItem />
        <NavigationItem mode={mode} />
        <BookmarkItem activeBookmarks={activeBookmarks} />
        {format === "readaloud" &&
          (mode === "audio" ? (
            <Link
              asChild
              replace
              href={{
                pathname: "/read/[uuid]",
                params: { uuid: book.uuid, format },
              }}
            >
              <Button
                accessibilityLabel={`Switch to reading ${book.title}`}
                variant="ghost"
                size="icon"
              >
                <Icon as={BookOpen} size={24} />
              </Button>
            </Link>
          ) : (
            <Link
              asChild
              replace
              href={{
                pathname: "/listen/[uuid]",
                params: { uuid: book.uuid, format },
              }}
            >
              <Button
                accessibilityLabel={`Switch to listening to ${book.title}`}
                variant="ghost"
                size="icon"
              >
                <Icon as={Headphones} size={24} />
              </Button>
            </Link>
          ))}
      </View>
    </>
  )
}
