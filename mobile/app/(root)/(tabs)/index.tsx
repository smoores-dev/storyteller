import { ScrollView, StyleSheet, View } from "react-native"
import { BookLink } from "../../../components/BookLink"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { HeaderText } from "../../../components/HeaderText"
import { MiniPlayerWidget } from "../../../components/MiniPlayerWidget"
import { useAppDispatch, useAppSelector } from "../../../store/appState"
import { getBookshelfBookIds } from "../../../store/selectors/bookshelfSelectors"
import { BrowseIcon } from "../../../icons/BrowseIcon"
import ContextMenu from "react-native-context-menu-view"
import * as DocumentPicker from "expo-document-picker"
import { localBookImported } from "../../../store/slices/bookshelfSlice"
import { UIText } from "../../../components/UIText"
import { colors } from "../../../components/ui/tokens/colors"
import { Link } from "expo-router"
import { spacing } from "../../../components/ui/tokens/spacing"
import { getUsername } from "../../../store/selectors/authSelectors"
import { PlusCircle } from "lucide-react-native"
import { useColorTheme } from "../../../hooks/useColorTheme"
import { fontSizes } from "../../../components/ui/tokens/fontSizes"

export default function Home() {
  const { top } = useSafeAreaInsets()
  const bookIds = useAppSelector(getBookshelfBookIds)
  const username = useAppSelector(getUsername)
  const dispatch = useAppDispatch()

  const { foreground, background, surface, dark } = useColorTheme()

  return (
    <View style={{ ...styles.container, paddingTop: top }}>
      <View style={styles.header}>
        <HeaderText style={styles.title}>Bookshelf</HeaderText>
        <ContextMenu
          actions={[
            {
              title: "Import local book",
              systemIcon: "plus.circle",
            },
          ]}
          onPress={({ nativeEvent }) => {
            switch (nativeEvent.index) {
              case 0: {
                DocumentPicker.getDocumentAsync({
                  copyToCacheDirectory: false,
                  type: "application/epub+zip",
                }).then(({ assets }) => {
                  if (!assets?.length) return
                  // We've already ensured this exists
                  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  const asset = assets[0]!
                  const bookId = Math.round(
                    Math.random() * Number.MAX_SAFE_INTEGER,
                  )
                  dispatch(localBookImported(bookId, asset.uri))
                })
                break
              }
              default: {
                break
              }
            }
          }}
          dropdownMenuMode
        >
          <BrowseIcon focused />
        </ContextMenu>
      </View>
      <ScrollView style={styles.bookLinks}>
        {bookIds.map((bookId) => (
          <BookLink key={bookId} bookId={bookId} />
        ))}
        {bookIds.length === 0 && (
          <View
            style={{
              gap: spacing[2],
              marginRight: spacing[2.5],
              padding: spacing[2],
              backgroundColor: surface,
              borderRadius: spacing.borderRadius,
            }}
          >
            <UIText style={fontSizes.base}>
              You don’t have any books downloaded, yet!
            </UIText>
            <UIText style={fontSizes.base}>
              You can either{" "}
              {!username && (
                <>
                  <Link href="/server">
                    <UIText
                      style={{
                        color: dark ? colors.blue3 : colors.blue8,
                        ...fontSizes.base,
                      }}
                    >
                      connect to a Storyteller instance
                    </UIText>
                  </Link>{" "}
                  and then download a book from the{" "}
                  <Link href="/browse">
                    <UIText
                      style={{
                        color: dark ? colors.blue3 : colors.blue8,
                        ...fontSizes.base,
                      }}
                    >
                      Browse tab
                    </UIText>
                  </Link>
                </>
              )}
              , or use the plus icon (
              <PlusCircle
                fill={foreground}
                stroke={background}
                style={{ marginBottom: -2 }}
              />
              ) to import a book file that you’ve already saved to your device.
            </UIText>
          </View>
        )}
        {/* Spacer for the miniplayer */}
        <View style={{ height: 76, width: "100%" }} />
      </ScrollView>
      <MiniPlayerWidget />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  title: {
    fontSize: 32,
  },
  header: {
    marginVertical: 32,
    paddingHorizontal: 24,
    alignSelf: "flex-start",
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookLinks: {
    width: "100%",
    paddingLeft: 24,
  },
  logLink: {
    position: "absolute",
    top: 48,
    right: 24,
  },
})
