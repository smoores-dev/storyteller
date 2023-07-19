"use client"

import { BookDetail } from "@/apiClient"
import { useEffect, useState } from "react"
import styles from "./books.module.css"
import { Button } from "@ariakit/react"
import { useApiClient } from "@/hooks/useApiClient"
import { useApiToken } from "@/hooks/useApiToken"

type Props = {
  apiHost: string
  book: BookDetail
}

const ProcessingTaskTypes = {
  SYNC_CHAPTERS: "Synchronizing chapters",
  SPLIT_CHAPTERS: "Splitting audiobook chapters",
  TRANSCRIBE_CHAPTERS: "Transcribing chapters",
}

export function BookStatus({ apiHost, book: initialBook }: Props) {
  const token = useApiToken()
  const client = useApiClient(apiHost, token)
  const [latestBook, setLatestBook] = useState(initialBook)

  useEffect(() => {
    const intervalId = setInterval(() => {
      client.default
        .getBookDetailsBooksBookIdGet(latestBook.id)
        .then((book) => setLatestBook(book))
    }, 20000)
    return () => clearInterval(intervalId)
  }, [client.default, latestBook.id])

  const synchronized =
    latestBook.processing_status?.current_task === "SYNC_CHAPTERS" &&
    latestBook.processing_status?.progress === 1

  const userFriendlyTaskType =
    latestBook.processing_status &&
    ProcessingTaskTypes[
      latestBook.processing_status
        .current_task as keyof typeof ProcessingTaskTypes
    ]

  return (
    <>
      <h3 className={styles["book-title"]}>{latestBook.title}</h3>
      {latestBook.authors[0] && <div>by {latestBook.authors[0].name}</div>}
      {synchronized ? (
        <div className={styles["download-wrapper"]}>
          <a href={`${apiHost}/books/${latestBook.id}/synced`}>Download</a>
        </div>
      ) : (
        latestBook.processing_status && (
          <div className={styles["status"]}>
            {userFriendlyTaskType} -{" "}
            {Math.floor(latestBook.processing_status.progress * 100)}%{" "}
            {latestBook.processing_status.in_error && (
              <>
                Failed
                <div>
                  <Button
                    onClick={() => {
                      client.default
                        .processBookBooksBookIdProcessPost(latestBook.id)
                        .then(() =>
                          client.default
                            .getBookDetailsBooksBookIdGet(latestBook.id)
                            .then((book) => setLatestBook(book))
                        )
                    }}
                  >
                    Retry
                  </Button>
                </div>
              </>
            )}
          </div>
        )
      )}
    </>
  )
}
