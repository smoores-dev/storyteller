import styles from "./bookoptions.module.css"
import { BookDetail } from "@/apiModels"
import { ProcessingTaskType } from "@/apiModels/models/ProcessingStatus"
import cx from "classnames"

import {
  TooltipProvider,
  Tooltip,
  TooltipAnchor,
  MenuItem,
} from "@ariakit/react"
import { HardRestartIcon } from "../icons/HardRestartIcon"
import { SoftRestartIcon } from "../icons/SoftRestartIcon"
import { StopIcon } from "../icons/StopIcon"
import { useApiClient } from "@/hooks/useApiClient"

type Props = {
  book: BookDetail
}

export function ProcessingItems({ book }: Props) {
  const client = useApiClient()

  if (
    !book.processing_status?.is_processing &&
    !book.processing_status?.is_queued
  ) {
    return (
      <>
        <MenuItem
          className={styles["menu-item"]}
          onClick={() => client.processBook(book.uuid, false)}
        >
          <TooltipProvider placement="right">
            <TooltipAnchor>
              <SoftRestartIcon ariaLabel="Re-process" />
            </TooltipAnchor>
            <Tooltip>Re-process</Tooltip>
          </TooltipProvider>
        </MenuItem>
        <MenuItem
          className={styles["menu-item"]}
          onClick={() => client.processBook(book.uuid, true)}
        >
          <TooltipProvider placement="right">
            <TooltipAnchor>
              <HardRestartIcon ariaLabel="Force re-process" />
            </TooltipAnchor>
            <Tooltip>Force re-process</Tooltip>
          </TooltipProvider>
        </MenuItem>
      </>
    )
  }

  if (
    !book.processing_status.is_processing ||
    book.processing_status.current_task !==
      ProcessingTaskType.TRANSCRIBE_CHAPTERS
  ) {
    return (
      <MenuItem
        className={cx(styles["menu-item"], styles["delete"])}
        onClick={() => client.cancelProcessing(book.uuid)}
      >
        <TooltipProvider placement="right">
          <TooltipAnchor>
            <StopIcon
              ariaLabel={
                book.processing_status.is_queued
                  ? "Remove from queue"
                  : "Stop processing"
              }
            />
          </TooltipAnchor>
          <Tooltip>
            {book.processing_status.is_queued
              ? "Remove from queue"
              : "Stop processing"}
          </Tooltip>
        </TooltipProvider>
      </MenuItem>
    )
  }

  return (
    <TooltipProvider placement="right">
      <Tooltip>
        It&apos;s unsafe to stop processing during transcription (sorry!)
      </Tooltip>
      <TooltipAnchor>
        <MenuItem
          disabled
          className={cx(styles["menu-item"], styles["delete"])}
          onClick={() => client.cancelProcessing(book.uuid)}
        >
          <StopIcon
            ariaLabel={
              book.processing_status.is_queued
                ? "Remove from queue"
                : "Stop processing"
            }
          />
        </MenuItem>
      </TooltipAnchor>
    </TooltipProvider>
  )
}
