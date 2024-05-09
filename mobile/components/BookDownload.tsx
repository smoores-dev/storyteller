import { Image, Pressable, StyleSheet, View } from "react-native"
import { UIText } from "./UIText"
import { DownloadIcon } from "../icons/DownloadIcon"
import { appColor } from "../design"
import { useAppDispatch, useAppSelector } from "../store/appState"
import {
  getIsBookDownloading,
  getLibraryBook,
} from "../store/selectors/librarySelectors"
import { getApiClient } from "../store/selectors/apiSelectors"
import { librarySlice } from "../store/slices/librarySlice"
import { DownloadingIndicator } from "./DownloadingIndicator"

type Props = {
  bookId: number
}

export function BookDownload({ bookId }: Props) {
  const book = useAppSelector((state) => getLibraryBook(state, bookId))
  const apiClient = useAppSelector(getApiClient)
  const isDownloading = useAppSelector((state) =>
    getIsBookDownloading(state, bookId),
  )

  const dispatch = useAppDispatch()

  if (!book) return null

  return (
    <View style={styles.container}>
      <Image
        source={{
          uri: apiClient?.getCoverUrl(bookId),
          headers: apiClient?.getHeaders(),
        }}
        style={styles.image}
      />
      <View style={styles.details}>
        <View style={styles.bookInfo}>
          <UIText numberOfLines={2} style={styles.title}>
            {book.title}
          </UIText>
          <UIText style={styles.authors}>
            {book.authors.map((author) => author.name).join(", ")}
          </UIText>
        </View>
        <View style={styles.controls}>
          {isDownloading ? (
            <DownloadingIndicator bookId={bookId} />
          ) : (
            <Pressable
              style={styles.downloadButton}
              onPress={() => {
                dispatch(librarySlice.actions.bookDownloadPressed({ bookId }))
              }}
            >
              <DownloadIcon />
              <UIText style={styles.downloadButtonText}>Download</UIText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
  },
  details: {
    flexDirection: "column",
    flex: 1,
    height: 136,
    marginRight: 24,
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  bookInfo: {},
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  authors: {
    fontSize: 15,
  },
  image: {
    height: 136,
    width: 88,
    marginRight: 20,
    borderRadius: 4,
    backgroundColor: "rgb(225, 225, 235)",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  downloadButton: {
    backgroundColor: appColor,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: "100%",
    borderRadius: 4,
  },
  downloadButtonText: {
    color: "white",
  },
  delete: {},
})
