import { AnimatedCircularProgress } from "react-native-circular-progress"
import { useAppSelector } from "../store/appState"
import { getBookDownloadProgress } from "../store/selectors/librarySelectors"
import { ArrowDownIcon } from "../icons/ArrowDownIcon"
import { useColorTheme } from "../hooks/useColorTheme"

type Props = {
  bookId: number
}

export function DownloadingIndicator({ bookId }: Props) {
  const { foreground } = useColorTheme()
  const downloadProgress = useAppSelector((state) =>
    getBookDownloadProgress(state, bookId),
  )

  const downloadFill = Math.trunc((downloadProgress ?? 0) * 100)

  return (
    <AnimatedCircularProgress
      size={24}
      width={2}
      fill={downloadFill}
      rotation={0}
      tintColor={foreground}
    >
      {() => <ArrowDownIcon />}
    </AnimatedCircularProgress>
  )
}
