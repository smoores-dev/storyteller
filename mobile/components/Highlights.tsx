import { View, Pressable } from "react-native"
import { ScrollView } from "react-native-gesture-handler"
import { useAppDispatch, useAppSelector } from "../store/appState"
import { getCurrentlyPlayingBook } from "../store/selectors/bookshelfSelectors"
import { bookshelfSlice } from "../store/slices/bookshelfSlice"
import { UIText } from "./UIText"
import { highlightTints, highlightUnderlines } from "../colors"
import { useColorTheme } from "../hooks/useColorTheme"
import { Stack } from "./ui/Stack"
import { colors } from "./ui/tokens/colors"
import { spacing } from "./ui/tokens/spacing"
import { fontSizes } from "./ui/tokens/fontSizes"

export function Highlights() {
  const book = useAppSelector(getCurrentlyPlayingBook)
  const { dark } = useColorTheme()
  const dispatch = useAppDispatch()

  if (!book) return null

  if (!book.highlights.length) {
    return (
      <Stack style={{ padding: spacing[12] }}>
        <UIText style={{ color: colors.gray8 }}>
          No highlights yet! Try adding some by selecting some text and choosing
          a color.
        </UIText>
      </Stack>
    )
  }

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
                  ...fontSizes.sm,
                  textAlign: "justify",
                  fontFamily: "Literata",
                  backgroundColor:
                    highlightTints[dark ? "dark" : "light"][highlight.color],
                  textDecorationLine: "underline",
                  textDecorationStyle: "solid",
                  textDecorationColor:
                    highlightUnderlines[dark ? "dark" : "light"][
                      highlight.color
                    ],
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
