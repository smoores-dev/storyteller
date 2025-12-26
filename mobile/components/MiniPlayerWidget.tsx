import { skipToken } from "@reduxjs/toolkit/query"
import { Link } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { View } from "react-native"

import { formatTime, useAudioBook } from "@/hooks/useAudioBook"
import { playerPositionSeeked } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { useGetBookQuery } from "@/store/localApi"
import {
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
} from "@/store/selectors/bookshelfSelectors"

import { AudiobookCover } from "./AudiobookCover"
import { PlayPause } from "./PlayPause"
import { ProgressBar } from "./ProgressBar"
import { Button } from "./ui/button"
import { Text } from "./ui/text"

export function MiniPlayerWidget() {
  const { progress, startPosition, endPosition, track, rate } = useAudioBook()

  const dispatch = useAppDispatch()
  const [eagerProgress, setEagerProgress] = useState(progress)

  const formattedEagerProgress = useMemo(() => {
    return formatTime(eagerProgress / rate)
  }, [eagerProgress, rate])

  const formattedProgress = useMemo(() => {
    return `${formattedEagerProgress} / ${track.formattedEndPosition}`
  }, [formattedEagerProgress, track.formattedEndPosition])

  useEffect(() => {
    setEagerProgress(progress)
  }, [progress])

  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const format = useAppSelector(getCurrentlyPlayingFormat)
  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )

  if (format === "ebook") return null

  if (!bookUuid) return null

  return (
    <View className="z-90 elevation bottom-safe-offset-2 absolute left-3 right-3 rounded bg-background shadow shadow-foreground">
      {book && (
        <View>
          <ProgressBar
            start={startPosition}
            stop={endPosition}
            progress={eagerProgress}
            onProgressChange={(value) => {
              setEagerProgress(value)
              dispatch(playerPositionSeeked({ progress: value }))
            }}
          />

          <View className="flex-row items-center justify-between gap-6 py-4 pr-8">
            <Link
              href={{
                pathname: "/listen/[uuid]",
                params: { uuid: bookUuid, format },
              }}
              asChild
            >
              <Button
                variant="ghost"
                className="shrink flex-row items-center justify-between gap-6 pr-12"
              >
                <View className="h-10 w-10">
                  <AudiobookCover book={book} style={{ borderRadius: 4 }} />
                </View>
                <View>
                  <Text numberOfLines={1} className="text-sm font-semibold">
                    {book.title}
                  </Text>
                  <Text numberOfLines={1} className="text-sm">
                    {formattedProgress}
                  </Text>
                </View>
              </Button>
            </Link>
            <PlayPause />
          </View>
        </View>
      )}
    </View>
  )
}
