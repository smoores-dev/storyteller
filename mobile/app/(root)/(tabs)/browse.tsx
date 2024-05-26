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

export default function Browse() {
  const { top } = useSafeAreaInsets()
  const bookIds = useAppSelector(getLibraryBookIds)
  const loading = useAppSelector(getIsLibraryLoading)
  const dispatch = useAppDispatch()

  useEffect(() => {
    dispatch(librarySlice.actions.libraryTabOpened())
  }, [dispatch])

  return (
    <View style={{ ...styles.container, paddingTop: top }}>
      <HeaderText style={styles.title}>Browse </HeaderText>
      <ScrollView
        style={styles.bookLinks}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => dispatch(librarySlice.actions.libraryRefreshed())}
          />
        }
      >
        {bookIds.map((bookId) => (
          <LibraryBook key={bookId} bookId={bookId} />
        ))}
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
