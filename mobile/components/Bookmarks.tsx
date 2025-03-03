import { View, Pressable } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { getCurrentlyPlayingBook } from "../store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"
import { UIText } from "./UIText"
import { Stack } from "./ui/Stack"
import { spacing } from "./ui/tokens/spacing"
import { colors } from "./ui/tokens/colors"
import { fontSizes } from "./ui/tokens/fontSizes"

export function Bookmarks() {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const dispatch = useAppDispatch()

  if (!book) return null

  if (!book.bookmarks.length) {
    return (
      <Stack style={{ padding: spacing[12] }}>
        {/* TODO: handle dark mode here */}
        <UIText style={{ color: colors.gray8 }}>
          No bookmarks yet! Try adding some by pressing the bookmark icon in the
          toolbar.
        </UIText>
      </Stack>
    )
  }

  return (
    <ScrollView>
      {book.bookmarks.map((bookmark) => (
        <View key={JSON.stringify(bookmark)} style={{ paddingHorizontal: 8 }}>
          <Pressable
            onPress={async () => {
              dispatch(
                bookshelfSlice.actions.bookmarkTapped({
                  bookId: book.id,
                  bookmark: { locator: bookmark, timestamp: Date.now() },
                }),
              )
            }}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.gray4,
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[2],
            }}
          >
            <UIText
              style={{
                ...fontSizes.sm,
                fontWeight: "bold",
              }}
            >
              {bookmark.title}
            </UIText>
            {bookmark.locations?.position && (
              <UIText
                style={{
                  ...fontSizes.xs,
                  marginTop: spacing[1],
                }}
              >
                Page {bookmark.locations?.position}
              </UIText>
            )}
          </Pressable>
        </View>
      ))}
    </ScrollView>
  )
}
