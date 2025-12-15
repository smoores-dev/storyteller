import classNames from "classnames"

import { cn } from "@/cn"
import { IconReadaloud } from "@/components/icons/IconReadaloud"
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
      label={`Readaloud syncing: ${syncing ? "On" : "Off"}`}
      icon={
        <IconReadaloud
          width={24}
          height={24}
          className={classNames(syncing && "text-reader-accent")}
        />
      }
      onClick={() => {
        dispatch(readingSessionSlice.actions.setSyncing(!syncing))
      }}
      className={cn(
        !syncing &&
          "before:bg-reader-text relative before:absolute before:left-1/2 before:top-1/2 before:z-[555] before:block before:h-5 before:w-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:rounded-none before:content-['']",
        className,
      )}
    />
  )
}
