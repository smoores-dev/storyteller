"use client"

import { BookDetail } from "@/apiModels"
import styles from "./books.module.css"
import { Button } from "@ariakit/react"
import { useApiClient } from "@/hooks/useApiClient"
import { BookOptions } from "./BookOptions"

type Props = {
  book: BookDetail
  onUpdate: () => void
}

const ProcessingTaskTypes = {
  SYNC_CHAPTERS: "Synchronizing chapters",
  SPLIT_CHAPTERS: "Splitting audiobook chapters",
  TRANSCRIBE_CHAPTERS: "Transcribing chapters",
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
    <>
      <h3 className={styles["book-title"]}>{book.title}</h3>
      {book.authors[0] && <div>by {book.authors[0].name}</div>}
      {synchronized ? (
        <div className={styles["download-wrapper"]}>
          <a href={client.getSyncedDownloadUrl(book.id)}>Download</a>
        </div>
      ) : (
        book.processing_status && (
          <div className={styles["status"]}>
            {userFriendlyTaskType} -{" "}
            {Math.floor(book.processing_status.progress * 100)}%{" "}
            {book.processing_status.in_error && (
              <>
                Failed
                <div>
                  <Button
                    onClick={() => {
                      client.processBook(book.id).then(() => onUpdate())
                    }}
                  >
                    Retry
                  </Button>
                </div>
              </>
            )}
            <BookOptions book={book} onUpdate={onUpdate} />
          </div>
        )
      )}
    </>
  )
}
