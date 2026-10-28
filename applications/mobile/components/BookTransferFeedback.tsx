import { BookOpen, TriangleAlert } from "lucide-react-native"
import { View, type ViewStyle } from "react-native"

import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  type BookImportStage,
  transferFeedbackSlice,
} from "@/store/slices/transferFeedbackSlice"

import { DownloadingIndicator } from "./DownloadingIndicator"
import { Button } from "./ui/button"
import { Icon } from "./ui/icon"
import { Text } from "./ui/text"

const INDICATOR_SIZE = 24

// The import steps report no byte-level progress, so each completed step fills
// the ring by a quarter.
const IMPORT_PROGRESS: Record<BookImportStage, number> = {
  copying: 25,
  extracting: 50,
  parsing: 75,
  saving: 100,
}

const IMPORT_LABEL: Record<BookImportStage, string> = {
  copying: "Copying book file…",
  extracting: "Extracting book file…",
  parsing: "Reading book contents…",
  saving: "Saving book…",
}

const OVERLAY_STYLE: ViewStyle = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  justifyContent: "flex-end",
  zIndex: 95,
}

/**
 * App-wide feedback for bringing a book onto the device: the stage of a local
 * import in progress, and the most recent import or download failure.
 */
export function BookTransferFeedback() {
  const dispatch = useAppDispatch()
  const importStage = useAppSelector(
    (state) => state.transferFeedback.importStage,
  )
  const failure = useAppSelector((state) => state.transferFeedback.failure)

  if (!importStage && !failure) return null

  return (
    <View
      pointerEvents="box-none"
      style={OVERLAY_STYLE}
      accessibilityLiveRegion="polite"
    >
      {importStage && (
        <View className="bg-popover border-border mb-safe-offset-4 mx-safe-or-4 flex-row items-center gap-3 rounded-xl border p-3 shadow-lg shadow-black/5">
          <DownloadingIndicator
            progress={IMPORT_PROGRESS[importStage]}
            size={INDICATOR_SIZE}
            style={{}}
            icon={BookOpen}
          />
          <Text className="flex-1 text-sm">{IMPORT_LABEL[importStage]}</Text>
        </View>
      )}
      {failure && (
        <View className="bg-popover border-destructive mb-safe-offset-4 mx-safe-or-4 flex-row items-center gap-3 rounded-xl border p-3 shadow-lg shadow-black/5">
          <Icon
            as={TriangleAlert}
            size={INDICATOR_SIZE}
            className="text-destructive"
          />
          <Text className="flex-1 text-sm" numberOfLines={4}>
            {failure}
          </Text>
          <Button
            size="sm"
            variant="ghost"
            accessibilityLabel="Dismiss error"
            onPress={() =>
              dispatch(
                transferFeedbackSlice.actions.bookTransferFailureDismissed(),
              )
            }
          >
            <Text>Dismiss</Text>
          </Button>
        </View>
      )}
    </View>
  )
}
