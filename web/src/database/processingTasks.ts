import { UUID } from "@/uuid"
import { getDatabase } from "./connection"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"

export const PROCESSING_TASK_ORDER = {
  [ProcessingTaskType.SPLIT_CHAPTERS]: 0,
  [ProcessingTaskType.TRANSCRIBE_CHAPTERS]: 1,
  [ProcessingTaskType.SYNC_CHAPTERS]: 2,
}

export type ProcessingTask = {
  uuid: UUID
  type: ProcessingTaskType
  status: ProcessingTaskStatus
  progress: number
  bookUuid: UUID
}

export function createProcessingTask(
  type: ProcessingTaskType,
  status: ProcessingTaskStatus,
  bookUuid: UUID,
) {
  const db = getDatabase()

  const { uuid } = db
    .prepare<{
      type: ProcessingTaskType
      status: ProcessingTaskStatus
      bookUuid: UUID
    }>(
      `
    INSERT INTO processing_task (type, status, book_uuid)
    VALUES ($type, $status, $bookUuid)
    RETURNING uuid
    `,
    )
    .get({
      type,
      status,
      bookUuid,
    }) as { uuid: UUID }

  return uuid
}

export function getProcessingTasksForBook(bookUuid: UUID) {
  const db = getDatabase()

  return db
    .prepare<{ bookUuid: UUID }>(
      `
    SELECT uuid, type, status, progress, book_uuid AS bookUuid
    FROM processing_task
    WHERE book_uuid = $bookUuid
    `,
    )
    .all({ bookUuid }) as ProcessingTask[]
}

export function resetProcessingTasksForBook(bookUuid: UUID) {
  const db = getDatabase()

  db.prepare(
    `
    UPDATE processing_task
    SET progress = 0.0, status = 'STARTED'
    WHERE book_uuid = $bookUuid
    `,
  ).run({
    bookUuid,
  })
}

export function updateTaskProgress(taskUuid: UUID, progress: number) {
  const db = getDatabase()

  db.prepare<{ progress: number; uuid: UUID }>(
    `
    UPDATE processing_task
    SET progress = $progress
    WHERE uuid = $uuid
    `,
  ).run({
    progress,
    uuid: taskUuid,
  })
}

export function updateTaskStatus(taskUuid: UUID, status: ProcessingTaskStatus) {
  const db = getDatabase()

  db.prepare<{ status: ProcessingTaskStatus; uuid: UUID }>(
    `
    UPDATE processing_task
    SET status = $status
    WHERE uuid = $uuid
    `,
  ).run({
    status,
    uuid: taskUuid,
  })
}
