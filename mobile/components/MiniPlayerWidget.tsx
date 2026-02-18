import { skipToken } from "@reduxjs/toolkit/query"
import { Link } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { View, type ViewStyle, useWindowDimensions } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"

import { playerPositionSeeked } from "@/store/actions"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import { useGetBookQuery } from "@/store/localApi"
import {
  formatTime,
  getCurrentTrackDuration,
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
  getFormattedDuration,
  getPlaybackRate,
  getPosition,
} from "@/store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "@/store/slices/bookshelfSlice"

import { AudiobookCover } from "./AudiobookCover"
import { PlayPause } from "./PlayPause"
import { ProgressBar } from "./ProgressBar"
import { Button } from "./ui/button"
import { Text } from "./ui/text"

export function MiniPlayerWidget() {
  const progress = useAppSelector(getPosition)
  const startPosition = 0
  const endPosition = useAppSelector(getCurrentTrackDuration)
  const rate = useAppSelector(getPlaybackRate)
  const formattedDuration = useAppSelector(getFormattedDuration)

  const dimensions = useWindowDimensions()

  const dispatch = useAppDispatch()
  const [eagerProgress, setEagerProgress] = useState(progress)

  const formattedEagerProgress = useMemo(() => {
    return formatTime(eagerProgress, rate)
  }, [eagerProgress, rate])

  const formattedProgress = useMemo(() => {
    return `${formattedEagerProgress} / ${formattedDuration}`
  }, [formattedEagerProgress, formattedDuration])

  useEffect(() => {
    setEagerProgress(progress)
  }, [progress])

  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const format = useAppSelector(getCurrentlyPlayingFormat)
  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )

  function onPanEnd() {
    dispatch(bookshelfSlice.actions.miniPlayerWidgetSwiped())
    translateX.set(0)
  }

  const translateX = useSharedValue(0)

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      "worklet"

      translateX.set(event.translationX)
    })
    .onEnd((event) => {
      "worklet"

      if (Math.abs(event.translationX) > dimensions.width * 0.25) {
        translateX.value = withTiming(
          dimensions.width * (event.translationX < 1 ? -2 : 2),
          {
            duration: 1200,
            easing: Easing.out(Easing.quad),
          },
        )
        scheduleOnRN(onPanEnd)
      } else {
        translateX.value = withTiming(0, {
          duration: 150,
          easing: Easing.out(Easing.quad),
        })
      }
    })

  const widgetAnimatedStyle = useAnimatedStyle(
    (): ViewStyle => ({
      transform: [{ translateX: translateX.value }],
    }),
  )

  if (format === "ebook") return null

  if (!bookUuid) return null

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        className="mb-safe-offset-2 absolute right-3 bottom-0 left-3 z-90 rounded-lg"
        style={widgetAnimatedStyle}
      >
        <View className="bg-background shadow-foreground/50 rounded-lg rounded-t-none shadow-sm">
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
      </Animated.View>
    </GestureDetector>
  )
}
