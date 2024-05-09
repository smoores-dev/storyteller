import {
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native"
import { getLocalAudioBookCoverUrl } from "../store/persistence/files"
import { ProgressBar } from "./ProgressBar"
import { PlayPause } from "./PlayPause"
import { Link } from "expo-router"
import { BookshelfBook } from "../store/slices/bookshelfSlice"
import { UIText } from "./UIText"

type Props = {
  book: BookshelfBook | null
  isPlaying: boolean
  isLoading: boolean
  progress: number
  startPosition: number
  endPosition: number
  style?: StyleProp<ViewStyle>
}

export function MiniPlayer({
  book,
  isPlaying,
  isLoading,
  progress,
  startPosition,
  endPosition,
  style,
}: Props) {
  return !book ? null : (
    <View style={style}>
      <View style={styles.details}>
        <Link href="/player" asChild>
          <Pressable style={styles.coverAndTitle}>
            <Image
              style={styles.cover}
              source={{ uri: getLocalAudioBookCoverUrl(book.id) }}
            />
            <UIText style={styles.title} numberOfLines={2}>
              {book.title}
            </UIText>
          </Pressable>
        </Link>
        <PlayPause isPlaying={isPlaying} isLoading={isLoading} />
      </View>

      <ProgressBar
        start={startPosition}
        stop={endPosition}
        progress={progress}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  details: {
    padding: 12,
    paddingRight: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  coverAndTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cover: {
    height: 40,
    width: 40,
    borderRadius: 4,
  },
  title: {
    flex: 1,
  },
})
