import { BookDetail } from "@/apiModels"
import {
  ProcessingTaskType,
  ProcessingTaskStatus,
} from "@/apiModels/models/ProcessingStatus"
import { ProcessingTask } from "@/database/processingTasks"
import { useState, useEffect } from "react"
import { useApiClient } from "./useApiClient"

export function useLiveBooks(initialBooks: BookDetail[] = []) {
  const client = useApiClient()
  const [books, setBooks] = useState(initialBooks)

  useEffect(() => {
    return client.subscribeToBookEvents((event) => {
      setBooks((books) => {
        if (event.type === "bookCreated") {
          return [event.payload, ...books]
        }

        if (event.type === "bookDeleted") {
          return books.filter((book) => book.uuid !== event.bookUuid)
        }

        const newBooks = books.map((book) => {
          if (book.uuid !== event.bookUuid) return book

          switch (event.type) {
            case "bookUpdated": {
              return { ...book, ...event.payload }
            }
            case "processingQueued": {
              return {
                ...book,
                processingStatus: "queued" as const,
                processingTask: {
                  type: ProcessingTaskType.SPLIT_CHAPTERS,
                  progress: 0,
                  status: ProcessingTaskStatus.STARTED,
                } as ProcessingTask,
              }
            }
            case "processingCompleted": {
              return {
                ...book,
                processingStatus: null,
                processingTask: {
                  type: ProcessingTaskType.SYNC_CHAPTERS,
                  progress: 1,
                  status: ProcessingTaskStatus.COMPLETED,
                } as ProcessingTask,
              }
            }
            case "processingStopped": {
              return {
                ...book,
                processingStatus: null,
                processingTask: {
                  type:
                    book.processingTask?.type ??
                    ProcessingTaskType.SPLIT_CHAPTERS,
                  progress: book.processingTask?.progress ?? 0,
                  status:
                    book.processingTask?.status ?? ProcessingTaskStatus.STARTED,
                } as ProcessingTask,
              }
            }
            case "processingFailed": {
              return {
                ...book,
                processingStatus: null,
                processingTask: {
                  ...book.processingTask,
                  status: ProcessingTaskStatus.IN_ERROR,
                } as ProcessingTask,
              }
            }
            case "processingStarted": {
              return {
                ...book,
                processingStatus: "processing" as const,
                processingTask: {
                  type: ProcessingTaskType.SPLIT_CHAPTERS,
                  progress: 0,
                  status: ProcessingTaskStatus.STARTED,
                } as ProcessingTask,
              }
            }
            case "taskProgressUpdated": {
              return {
                ...book,
                processingStatus: "processing" as const,
                processingTask: {
                  ...book.processingTask,
                  progress: event.payload.progress,
                  status: ProcessingTaskStatus.STARTED,
                } as ProcessingTask,
              }
            }
            case "taskTypeUpdated": {
              return {
                ...book,
                processingStatus: "processing" as const,
                processingTask: {
                  ...book.processingTask,
                  type: event.payload.taskType,
                  status: ProcessingTaskStatus.STARTED,
                } as ProcessingTask,
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
  }, [client])

  return books
}
