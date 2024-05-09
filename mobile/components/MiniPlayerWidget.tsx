import { StyleSheet, View } from "react-native"
import { MiniPlayer } from "./MiniPlayer"
import { useAudioBook } from "../hooks/useAudioBook"
import { useAppSelector } from "../store/appState"
import { getCurrentlyPlayingBook } from "../store/selectors/bookshelfSelectors"

export function MiniPlayerWidget() {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const { isPlaying, isLoading, progress, startPosition, endPosition } =
    useAudioBook()

  return (
    <View style={styles.player}>
      <MiniPlayer
        book={book}
        isPlaying={isPlaying}
        isLoading={isLoading}
        progress={progress}
        startPosition={startPosition}
        endPosition={endPosition}
      />
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
    backgroundColor: "white",
    borderRadius: 4,
    shadowRadius: 4,
    shadowOpacity: 0.3,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowColor: "black",
  },
})
