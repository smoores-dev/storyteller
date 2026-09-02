import { cn } from "@v3/_/lib/utils"

import * as icon from "@/icons"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  readingSessionSlice,
  selectIsSyncing,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

import { ToolbarIcon } from "./ToolbarIcon"

export const ReadaloudSyncingToggle = ({
  className,
}: {
  className?: string
}) => {
  const dispatch = useAppDispatch()
  const syncing = useAppSelector(selectIsSyncing)

  const mode = useAppSelector(selectReadingMode)
  if (mode !== "readaloud") return null

  return (
    <ToolbarIcon
      label={syncing ? "Read along: on" : "Read along: off"}
      icon={
        <icon.Readaloud
          size="lg"
          className={cn(
            "transition-opacity duration-150",
            syncing ? "text-reader-accent" : "opacity-40",
          )}
        />
      }
      onClick={() => {
        dispatch(readingSessionSlice.actions.setSyncing(!syncing))
      }}
      className={cn(
        !syncing &&
          "before:bg-reader-text-muted relative before:absolute before:top-1/2 before:left-1/2 before:h-5 before:w-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:rounded-full before:content-['']",
        className,
      )}
    />
  )
}
