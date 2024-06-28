import {
  View,
  Pressable,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
} from "react-native"
import { appColor } from "../design"
import { toolbarSlice } from "../store/slices/toolbarSlice"
import { ReadingSettings } from "./ReadingSettings"
import { UIText } from "./UIText"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useColorTheme } from "../hooks/useColorTheme"
import { useAppDispatch } from "../store/appState"

type Props = {
  bookId: number
}

export function BookSettingsMenu({ bookId }: Props) {
  const insets = useSafeAreaInsets()
  const dimensions = useWindowDimensions()
  const { background, foreground } = useColorTheme()
  const dispatch = useAppDispatch()

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: background,
          shadowColor: foreground,
        },
      ]}
    >
      <Pressable
        style={styles.doneButton}
        onPress={() => {
          dispatch(toolbarSlice.actions.dialogClosed())
        }}
      >
        <UIText style={styles.doneText}>Done</UIText>
      </Pressable>
      <ScrollView style={{ height: dimensions.height / 2 - insets.top }}>
        <ReadingSettings bookId={bookId} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    top: "50%",
    left: 0,
    right: 0,
    zIndex: 4,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderColor: "#AAA",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    shadowRadius: 4,
    shadowOpacity: 0.3,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 4,
  },
  doneButton: { alignSelf: "flex-end" },
  doneText: { fontSize: 18, paddingTop: 8, color: appColor },
})
