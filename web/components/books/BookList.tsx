"use client"

import type { BookEvent } from "@/events"
import { BookDetail } from "@/apiModels"
import { BookStatus } from "./BookStatus"
import styles from "./books.module.css"
import { useEffect, useState } from "react"
import { AddBookForm } from "./AddBookForm"
import { usePermission } from "@/contexts/UserPermissions"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"

type Props = {
  books: BookDetail[]
}

export function BookList({ books: initialBooks }: Props) {
  const canListBooks = usePermission("book_list")

  const [books, setBooks] = useState(initialBooks)

  useEffect(() => {
    const eventSource = new EventSource("/api/books/events")

    eventSource.addEventListener("message", (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as BookEvent
      setBooks((books) => {
        if (data.type === "bookCreated") {
          return [data.payload, ...books]
        }

        if (data.type === "bookDeleted") {
          return books.filter((book) => book.uuid !== data.bookUuid)
        }

        const newBooks = books.map((book) => {
          if (book.uuid !== data.bookUuid) return book

          switch (data.type) {
            case "bookUpdated": {
              return { ...book, ...data.payload }
            }
            case "taskQueued": {
              return {
                ...book,
                processing_status: {
                  is_queued: true,
                  is_processing: false,
                  current_task: ProcessingTaskType.SPLIT_CHAPTERS,
                  progress: 0,
                  status: ProcessingTaskStatus.STARTED,
                },
              }
            }
            case "taskCompleted": {
              return {
                ...book,
                processing_status: {
                  is_processing: false,
                  is_queued: false,
                  current_task: ProcessingTaskType.SYNC_CHAPTERS,
                  progress: 1,
                  status: ProcessingTaskStatus.COMPLETED,
                },
              }
            }
            case "taskStopped": {
              return {
                ...book,
                processing_status: {
                  is_processing: false,
                  is_queued: false,
                  current_task:
                    book.processing_status?.current_task ??
                    ProcessingTaskType.SPLIT_CHAPTERS,
                  progress: book.processing_status?.progress ?? 0,
                  status: ProcessingTaskStatus.STARTED,
                },
              }
            }
            case "taskFailed": {
              return {
                ...book,
                processing_status: {
                  is_processing: false,
                  is_queued: false,
                  current_task: ProcessingTaskType.SYNC_CHAPTERS,
                  progress: 1,
                  status: ProcessingTaskStatus.IN_ERROR,
                },
              }
            }
            case "taskStarted": {
              return {
                ...book,
                processing_status: {
                  is_processing: true,
                  is_queued: false,
                  current_task: ProcessingTaskType.SPLIT_CHAPTERS,
                  progress: 0,
                  status: ProcessingTaskStatus.STARTED,
                },
              }
            }
            case "taskProgressUpdated": {
              return {
                ...book,
                processing_status: {
                  is_processing: true,
                  is_queued: false,
                  current_task:
                    book.processing_status?.current_task ??
                    ProcessingTaskType.SPLIT_CHAPTERS,
                  progress: data.payload.progress,
                  status: ProcessingTaskStatus.STARTED,
                },
              }
            }
            case "taskTypeUpdated": {
              return {
                ...book,
                processing_status: {
                  is_processing: true,
                  is_queued: false,
                  current_task: data.payload.taskType,
                  progress: 0,
                  status: ProcessingTaskStatus.STARTED,
                },
              }
            }
          }
        })
        return newBooks
      })
    })

    return () => {
      eventSource.close()
    }
  }, [])

  return (
    <>
      <AddBookForm />
      {canListBooks && (
        <ul className={styles["book-list"]}>
          {books.map((book) => (
            <li key={book.uuid} className={styles["book-status"]}>
              <BookStatus book={book} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
