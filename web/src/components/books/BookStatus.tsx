"use client"

import Image from "next/image"
import { BookDetail } from "@/apiModels"
import styles from "./bookstatus.module.css"
import { useApiClient } from "@/hooks/useApiClient"
import { BookOptions } from "./BookOptions"
import { ProgressBar } from "./ProgressBar"
import { ProcessingFailedMessage } from "./ProcessingFailedMessage"
import { Button } from "@ariakit/react"
import { usePermissions } from "@/contexts/UserPermissions"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"

type Props = {
  book: BookDetail
}

export const ProcessingTaskTypes = {
  SYNC_CHAPTERS: "Synchronizing chapters",
  SPLIT_CHAPTERS: "Pre-processing audio",
  TRANSCRIBE_CHAPTERS: "Transcribing tracks",
}

export function BookStatus({ book }: Props) {
  const client = useApiClient()

  const permissions = usePermissions()

  const synchronized =
    book.processing_status?.current_task === ProcessingTaskType.SYNC_CHAPTERS &&
    book.processing_status.status === ProcessingTaskStatus.COMPLETED

  const userFriendlyTaskType =
    book.processing_status &&
    ProcessingTaskTypes[
      book.processing_status.current_task as keyof typeof ProcessingTaskTypes
    ]

  if (!permissions.book_read) return null

  return (
    <div className={styles["container"]}>
      <Image
        height={150}
        width={98}
        alt=""
        aria-hidden
        src={client.getCoverUrl(book.uuid)}
      />
      <div className={styles["content"]}>
        <div>
          <h3 className={styles["book-title"]}>{book.title}</h3>
          {book.authors[0] && <div>{book.authors[0].name}</div>}
        </div>
        {synchronized ? (
          permissions.book_download && (
            <div className={styles["download-wrapper"]}>
              <a href={client.getSyncedDownloadUrl(book.uuid)}>Download</a>
            </div>
          )
        ) : book.processing_status ? (
          book.processing_status.is_queued ? (
            "Queued"
          ) : (
            <div className={styles["status"]}>
              {userFriendlyTaskType}
              {book.processing_status.is_processing ? "" : " (stopped)"}
              {book.processing_status.status ===
                ProcessingTaskStatus.IN_ERROR && <ProcessingFailedMessage />}
              <ProgressBar
                progress={Math.floor(book.processing_status.progress * 100)}
              />
            </div>
          )
        ) : permissions.book_process ? (
          <Button
            className={styles["button"]}
            onClick={() => {
              void client.processBook(book.uuid)
            }}
          >
            Start processing
          </Button>
        ) : (
          <div className={styles["status"]}>Unprocessed</div>
        )}
      </div>
      <div className={styles["actions"]}>
        <BookOptions synchronized={synchronized} book={book} />
      </div>
    </div>
  )
}
