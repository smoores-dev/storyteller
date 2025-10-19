import { ActionIcon, Tooltip } from "@mantine/core"
import classNames from "classnames"
import { twMerge } from "tailwind-merge"

import { IconReadaloud } from "@/components/icons/IconReadaloud"
import { useAppDispatch, useAppSelector } from "@/store/appState"
import {
  readingSessionSlice,
  selectIsSyncing,
  selectReadingMode,
} from "@/store/slices/readingSessionSlice"

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
    <Tooltip label={`Readaloud syncing: ${syncing ? "On" : "Off"}`}>
      <ActionIcon
        variant="subtle"
        size="lg"
        className={twMerge(
          classNames(
            className,
            "text-reader-text hover:bg-reader-surface-hover hover:text-reader-text relative bg-transparent",

            !syncing &&
              "before:bg-reader-text relative before:absolute before:left-1/2 before:top-1/2 before:z-[555] before:block before:h-5 before:w-0.5 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:rounded-none before:content-['']",
          ),
        )}
        onClick={() => {
          dispatch(readingSessionSlice.actions.setSyncing(!syncing))
        }}
      >
        <span className="sr-only">Toggle readaloud syncing</span>
        <IconReadaloud
          width={24}
          height={24}
          className={classNames(syncing && "text-reader-accent")}
        />
      </ActionIcon>
    </Tooltip>
  )
}
