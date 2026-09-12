import { skipToken } from "@reduxjs/toolkit/query"
import * as Haptics from "expo-haptics"
import { BookmarkCheck, BookmarkIcon } from "lucide-react-native"
import { type ViewStyle } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { type Bookmark } from "@/database/bookmarks"
import { buildAudiobookLocator } from "@/modules/readium"
import { useAppSelector } from "@/store/appState"
import {
  useCreateBookmarkMutation,
  useDeleteBookmarksMutation,
  useGetBookQuery,
} from "@/store/localApi"
import {
  getCurrentTrack,
  getCurrentlyPlayingBookUuid,
  getCurrentlyPlayingFormat,
  getPosition,
  getTracks,
} from "@/store/selectors/bookshelfSelectors"
import { randomUUID } from "@/uuid"

const BOOKMARK_CONFIRMATION_SCALE = 1.15
const BOOKMARK_WIGGLE_DEGREES = 15
const BOOKMARK_SCALE_SPRING = {
  mass: 1.8,
  damping: 28,
  stiffness: 96,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
}
const BOOKMARK_WIGGLE_SPRING = {
  mass: 0.6,
  damping: 5,
  stiffness: 110,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
}

function triggerBookmarkPressHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

interface Props {
  activeBookmarks: Bookmark[]
}

export function BookmarkItem({ activeBookmarks }: Props) {
  const bookUuid = useAppSelector(getCurrentlyPlayingBookUuid)
  const format = useAppSelector(getCurrentlyPlayingFormat)
  const { data: book } = useGetBookQuery(
    bookUuid ? { uuid: bookUuid } : skipToken,
  )
  const [createBookmark] = useCreateBookmarkMutation()
  const [deleteBookmarks] = useDeleteBookmarksMutation()
  const bookmarkScale = useSharedValue(1)
  const bookmarkRotation = useSharedValue(0)

  const position = useAppSelector(getPosition)
  const currentTrack = useAppSelector(getCurrentTrack)
  const tracks = useAppSelector(getTracks)

  const buttonAnimatedStyle = useAnimatedStyle((): ViewStyle => ({
    transform: [{ scale: bookmarkScale.value }],
  }))
  const iconAnimatedStyle = useAnimatedStyle((): ViewStyle => ({
    transform: [{ rotate: `${bookmarkRotation.value}deg` }],
  }))

  if (!bookUuid) return null

  const isStandaloneAudiobook = format === "audiobook"

  const showActive = activeBookmarks.length > 0

  const runBookmarkConfirmationAnimation = () => {
    // oxlint-disable-next-line react-compiler/react-compiler -- this writes to shared values, not to a returned object
    bookmarkScale.value = BOOKMARK_CONFIRMATION_SCALE
    bookmarkScale.value = withSpring(1, BOOKMARK_SCALE_SPRING)
    bookmarkRotation.value = -BOOKMARK_WIGGLE_DEGREES
    bookmarkRotation.value = withSpring(0, BOOKMARK_WIGGLE_SPRING)
  }

  return (
    <Animated.View style={buttonAnimatedStyle}>
      <Button
        accessibilityLabel={showActive ? "Remove bookmark" : "Add bookmark"}
        className="items-center rounded"
        size="icon"
        variant="ghost"
        onPress={() => {
          triggerBookmarkPressHaptic()
          if (showActive) {
            deleteBookmarks({
              bookUuid,
              bookmarkUuids: activeBookmarks.map((bookmark) => bookmark.uuid),
            })
          } else {
            const locatorForCreate = isStandaloneAudiobook
              ? currentTrack
                ? buildAudiobookLocator(tracks, currentTrack, position)
                : undefined
              : book?.position?.locator

            if (!locatorForCreate) return

            createBookmark({
              uuid: randomUUID(),
              bookUuid,
              locator: locatorForCreate,
            })
              .unwrap()
              .then(runBookmarkConfirmationAnimation)
              .catch(() => {})
          }
        }}
      >
        <Animated.View style={iconAnimatedStyle}>
          {showActive ? (
            <Icon as={BookmarkCheck} size={24} />
          ) : (
            <Icon as={BookmarkIcon} size={24} />
          )}
        </Animated.View>
      </Button>
    </Animated.View>
  )
}
