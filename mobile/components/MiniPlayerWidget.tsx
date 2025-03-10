import { StyleSheet, View, Image, Pressable, Platform } from "react-native"
import { formatTime, useAudioBook } from "../hooks/useAudioBook"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { getCurrentlyPlayingBook } from "../store/selectors/bookshelfSelectors"
import { useColorTheme } from "../hooks/useColorTheme"
import { useState, useEffect, useMemo } from "react"
import { ProgressBar } from "./ProgressBar"
import { playerPositionSeeked } from "../store/slices/bookshelfSlice"
import { Link } from "expo-router"
import { getLocalAudioBookCoverUrl } from "../store/persistence/files"
import { UIText } from "./UIText"
import { PlayPause } from "./PlayPause"
import { spacing } from "./ui/tokens/spacing"
import { fontSizes } from "./ui/tokens/fontSizes"

export function MiniPlayerWidget() {
  const { foreground, background } = useColorTheme()

  const {
    isPlaying,
    isLoading,
    progress,
    startPosition,
    endPosition,
    track,
    rate,
  } = useAudioBook()

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

  const book = useAppSelector(getCurrentlyPlayingBook)

  return (
    <View
      style={[
        styles.player,
        { backgroundColor: background, shadowColor: foreground },
      ]}
    >
      {book && (
        <View>
          <ProgressBar
            style={
              Platform.OS === "ios"
                ? { marginTop: -18, marginBottom: -18 }
                : undefined
            }
            start={startPosition}
            stop={endPosition}
            progress={eagerProgress}
            onProgressChange={(value) => {
              setEagerProgress(value)
              dispatch(playerPositionSeeked({ progress: value }))
            }}
          />

          <View
            style={{
              paddingVertical: 15,
              paddingLeft: 15,
              paddingRight: spacing[4],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[3],
            }}
          >
            <Link href="/player" asChild>
              <Pressable style={styles.details}>
                <Image
                  style={{
                    height: 40,
                    width: 40,
                    borderRadius: 4,
                  }}
                  source={{ uri: getLocalAudioBookCoverUrl(book.id) }}
                />
                <View>
                  <UIText
                    numberOfLines={1}
                    style={{
                      ...fontSizes.sm,
                      fontWeight: 600,
                    }}
                  >
                    {book.title}
                  </UIText>
                  <UIText
                    numberOfLines={1}
                    style={{
                      ...fontSizes.sm,
                    }}
                  >
                    {formattedProgress}
                  </UIText>
                </View>
              </Pressable>
            </Link>
            <PlayPause isPlaying={isPlaying} isLoading={isLoading} />
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  player: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 1000,
    borderRadius: 4,
    shadowRadius: 4,
    shadowOpacity: 0.3,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },
  details: {
    paddingRight: spacing[6],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    flexShrink: 1,
  },
})
