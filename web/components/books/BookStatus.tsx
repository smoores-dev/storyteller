"use client"

import Image from "next/image"
import { BookDetail } from "@/apiModels"
import styles from "./bookstatus.module.css"
import { useApiClient } from "@/hooks/useApiClient"
import { BookOptions } from "./BookOptions"
import { ProgressBar } from "./ProgressBar"
import { ProcessingFailedMessage } from "./ProcessingFailedMessage"
import { Button } from "@ariakit/react"

type Props = {
  book: BookDetail
  onUpdate: () => void
}

const ProcessingTaskTypes = {
  SYNC_CHAPTERS: "Synchronizing chapters",
  SPLIT_CHAPTERS: "Pre-processing audio",
  TRANSCRIBE_CHAPTERS: "Transcribing tracks",
}

export function BookStatus({ book, onUpdate }: Props) {
  const client = useApiClient()

  const synchronized =
    book.processing_status?.current_task === "SYNC_CHAPTERS" &&
    book.processing_status?.progress === 1

  const userFriendlyTaskType =
    book.processing_status &&
    ProcessingTaskTypes[
      book.processing_status.current_task as keyof typeof ProcessingTaskTypes
    ]

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
          <div className={styles["download-wrapper"]}>
            <a href={client.getSyncedDownloadUrl(book.uuid)}>Download</a>
          </div>
        ) : book.processing_status ? (
          <div className={styles["status"]}>
            {userFriendlyTaskType}
            {book.processing_status.in_error && <ProcessingFailedMessage />}
            <ProgressBar
              progress={Math.floor(book.processing_status.progress * 100)}
            />
          </div>
        ) : (
          <Button
            className={styles["button"]}
            onClick={async () => {
              await client.processBook(book.uuid)
              onUpdate()
            }}
          >
            Start processing
          </Button>
        )}
      </div>
      <div className={styles["actions"]}>
        <BookOptions book={book} onUpdate={onUpdate} />
      </div>
    </div>
  )
}
