import { RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import { LibraryBook } from "../../../components/LibraryBook"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { HeaderText } from "../../../components/HeaderText"
import { MiniPlayerWidget } from "../../../components/MiniPlayerWidget"
import { useAppDispatch, useAppSelector } from "../../../store/appState"
import {
  getIsLibraryLoading,
  getLibraryBookIds,
} from "../../../store/selectors/librarySelectors"
import { useEffect } from "react"
import { librarySlice } from "../../../store/slices/librarySlice"
import { getUsername } from "../../../store/selectors/authSelectors"
import { spacing } from "../../../components/ui/tokens/spacing"
import { useColorTheme } from "../../../hooks/useColorTheme"
import { UIText } from "../../../components/UIText"
import { Link } from "expo-router"
import { colors } from "../../../components/ui/tokens/colors"
import { fontSizes } from "../../../components/ui/tokens/fontSizes"

export default function Browse() {
  const { top } = useSafeAreaInsets()
  const bookIds = useAppSelector(getLibraryBookIds)
  const username = useAppSelector(getUsername)
  const loading = useAppSelector(getIsLibraryLoading)
  const dispatch = useAppDispatch()
  const { surface, dark } = useColorTheme()

  useEffect(() => {
    dispatch(librarySlice.actions.libraryTabOpened())
  }, [dispatch])

  return (
    <View style={{ ...styles.container, paddingTop: top }}>
      <HeaderText style={styles.title}>Browse</HeaderText>
      {username ? (
        <>
          <ScrollView
            style={styles.bookLinks}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() =>
                  dispatch(librarySlice.actions.libraryRefreshed())
                }
              />
            }
          >
            {bookIds.map((bookId) => (
              <LibraryBook key={bookId} bookId={bookId} />
            ))}
            {bookIds.length === 0 && (
              <View
                style={{
                  gap: spacing[2],
                  marginHorizontal: spacing[2.5],
                  padding: spacing[2],
                  backgroundColor: surface,
                  borderRadius: spacing.borderRadius,
                }}
              >
                <UIText style={fontSizes.base}>
                  This tab is for downloading books that have been aligned by a
                  Storyteller server.
                </UIText>
                <UIText style={fontSizes.base}>
                  It looks like your connected server doesn’t have any aligned
                  books, yet!
                </UIText>
              </View>
            )}
            {/* Spacer for the miniplayer */}
            <View style={{ height: 76, width: "100%" }} />
          </ScrollView>
        </>
      ) : (
        <View
          style={{
            gap: spacing[2],
            marginHorizontal: spacing[2.5],
            padding: spacing[2],
            backgroundColor: surface,
            borderRadius: spacing.borderRadius,
          }}
        >
          <UIText style={fontSizes.base}>
            This tab is for downloading books that have been aligned by a
            Storyteller server.
          </UIText>
          <UIText style={fontSizes.base}>
            To get started,{" "}
            <Link href="/server">
              <UIText
                style={{
                  color: dark ? colors.blue3 : colors.blue8,
                  ...fontSizes.base,
                }}
              >
                connect to a Storyteller instance
              </UIText>
            </Link>
            !
          </UIText>
        </View>
      )}
      <MiniPlayerWidget />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: "#fff",
    alignItems: "center",
  },
  title: {
    marginVertical: 32,
    paddingLeft: 24,
    fontSize: 32,
    alignSelf: "flex-start",
  },
  bookLinks: {
    width: "100%",
    paddingLeft: 24,
  },
})
