import { BookDetail } from "@/apiModels"
import {
  ProcessingTaskType,
  ProcessingTaskStatus,
} from "@/apiModels/models/ProcessingStatus"
import { BookEvent } from "@/events"
import { useState, useEffect } from "react"

export function useLiveBooks(initialBooks: BookDetail[] = []) {
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
            case "processingQueued": {
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
            case "processingCompleted": {
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
            case "processingStopped": {
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
            case "processingFailed": {
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
            case "processingStarted": {
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
            default: {
              return book
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

  return books
}
