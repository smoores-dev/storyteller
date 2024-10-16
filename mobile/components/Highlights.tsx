import { ScrollView, View, Pressable } from "react-native"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { getCurrentlyPlayingBook } from "../store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"
import { UIText } from "./UIText"
import { highlightTints } from "../colors"
import { useColorTheme } from "../hooks/useColorTheme"

export function Highlights() {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const { dark } = useColorTheme()
  const dispatch = useAppDispatch()

  if (!book) return null

  return (
    <ScrollView>
      {book.highlights.map((highlight) => (
        <View key={highlight.id} style={{ paddingHorizontal: 8 }}>
          <Pressable
            onPress={async () => {
              dispatch(
                bookshelfSlice.actions.bookmarkTapped({
                  bookId: book.id,
                  bookmark: {
                    locator: highlight.locator,
                    timestamp: Date.now(),
                  },
                }),
              )
            }}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: "#CCC",
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
          >
            <UIText
              style={{
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              {highlight.locator.title}
            </UIText>
            {highlight.locator.locations?.position && (
              <UIText
                style={{
                  fontSize: 13,
                  marginVertical: 8,
                }}
              >
                Page {highlight.locator.locations.position}
              </UIText>
            )}
            {highlight.locator.text?.highlight && (
              <UIText
                style={{
                  fontSize: 13,
                  fontFamily: "Bookerly",
                  backgroundColor:
                    highlightTints[dark ? "dark" : "light"][highlight.color],
                }}
              >
                {highlight.locator.text.highlight}
              </UIText>
            )}
          </Pressable>
        </View>
      ))}
    </ScrollView>
  )
}
