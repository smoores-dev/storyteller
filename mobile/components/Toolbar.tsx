import { skipToken } from "@reduxjs/toolkit/query"
import { Link } from "expo-router"
import { BookOpen, Headphones } from "lucide-react-native"
import { View } from "react-native"

import { type Bookmark } from "@/database/bookmarks"
import { useAppSelector } from "@/store/appState"
import { useGetBookQuery } from "@/store/localApi"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
} from "@/store/selectors/bookshelfSelectors"

import { BookmarkItem } from "./toolbarItems/BookmarkItem"
import { NavigationItem } from "./toolbarItems/NavigationItem"
import { SettingsItem } from "./toolbarItems/SettingsItem"
import { SleepTimerItem } from "./toolbarItems/SleepTimerItem"
import { SpeedItem } from "./toolbarItems/SpeedItem"
import { Button } from "./ui/button"
import { Icon } from "./ui/icon"

type Props = {
  mode: "audio" | "text"
  activeBookmarks: Bookmark[]
}

export function Toolbar({ mode, activeBookmarks }: Props) {
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const selectedFormat = useAppSelector(getCurrentlyPlayingFormat)
  const format = selectedFormat ?? "readaloud"

  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )
  if (!book) return null

  return (
    <>
      <View className="flex-row items-center gap-1">
        {mode === "text" && <SettingsItem />}
        <SleepTimerItem />
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
              <Button variant="ghost" size="icon">
                <Icon as={BookOpen} size={24} />
              </Button>
            </Link>
          ) : (
            <Link
              asChild
              href={{
                pathname: "/listen/[uuid]",
                params: { uuid: book.uuid, format },
              }}
            >
              <Button variant="ghost" size="icon">
                <Icon as={Headphones} size={24} />
              </Button>
            </Link>
          ))}
      </View>
    </>
  )
}
