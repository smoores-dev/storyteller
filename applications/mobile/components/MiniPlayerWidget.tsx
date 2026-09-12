import { skipToken } from "@reduxjs/toolkit/query"
import { Link } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import {
  Platform,
  TouchableOpacity,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native"
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
  const [progressBarHeight, setProgressBarHeight] = useState(0)

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

  const widgetAnimatedStyle = useAnimatedStyle((): ViewStyle => ({
    transform: [{ translateX: translateX.value }],
  }))

  if (format === "ebook") return null

  if (!bookUuid) return null

  return (
    <Animated.View
      className="mb-safe-offset-2 absolute right-3 bottom-0 left-3 z-90 rounded-lg"
      style={widgetAnimatedStyle}
    >
      <View
        className={
          "bg-background shadow-foreground/50 ios:rounded-t-none rounded-lg shadow-sm"
        }
      >
        {book && (
          <View>
            <View
              onLayout={(event) => {
                const { height } = event.nativeEvent.layout
                setProgressBarHeight((currentHeight) =>
                  currentHeight === height ? currentHeight : height,
                )
              }}
              style={{
                transform: [
                  {
                    translateY: Platform.select({
                      ios: -progressBarHeight / 2 + 3,
                      default: -progressBarHeight / 3 + 3,
                    }),
                  },
                ],
                marginBottom: Platform.select({
                  ios: -progressBarHeight / 2 + 2,
                  default: undefined,
                }),
              }}
            >
              <ProgressBar
                accessibilityLabel="Mini player progress"
                start={startPosition}
                stop={endPosition}
                progress={eagerProgress}
                onProgressChange={(value) => {
                  setEagerProgress(value)
                  dispatch(playerPositionSeeked({ progress: value }))
                }}
              />
            </View>

            <GestureDetector gesture={panGesture}>
              <View className="mb-2 flex-row items-center justify-between gap-6 pr-8">
                <Link
                  href={{
                    pathname: "/listen/[uuid]",
                    params: { uuid: bookUuid, format },
                  }}
                  asChild
                >
                  <TouchableOpacity
                    accessibilityLabel={`Open audio player for ${book.title}`}
                    accessibilityRole="button"
                    className="shrink flex-row items-center justify-between gap-6 px-6"
                  >
                    <View className="h-10 w-10">
                      <AudiobookCover book={book} style={{ borderRadius: 4 }} />
                    </View>
                    <View>
                      <Text numberOfLines={1} className="text-sm">
                        {book.title}
                      </Text>
                      <Text numberOfLines={1} className="text-sm">
                        {formattedProgress}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </Link>
                <PlayPause />
              </View>
            </GestureDetector>
          </View>
        )}
      </View>
    </Animated.View>
  )
}
