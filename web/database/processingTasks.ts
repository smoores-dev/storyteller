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

export async function createProcessingTask(
  type: ProcessingTaskType,
  status: ProcessingTaskStatus,
  bookUuid: UUID,
) {
  const db = await getDatabase()

  const { uuid } = await db.get<{ uuid: UUID }>(
    `
    INSERT INTO processing_task (type, status, book_uuid)
    VALUES ($type, $status, $book_uuid)
    RETURNING uuid
    `,
    {
      $type: type,
      $status: status,
      $book_uuid: bookUuid,
    },
  )

  return uuid
}

export async function getProcessingTasksForBook(bookUuid: UUID) {
  const db = await getDatabase()

  return db.all<ProcessingTask>(
    `
    SELECT uuid, type, status, progress, book_uuid AS bookUuid
    FROM processing_task
    WHERE book_uuid = $bookUuid
    `,
    { $bookUuid: bookUuid },
  )
}

export async function resetProcessingTasksForBook(bookUuid: UUID) {
  const db = await getDatabase()

  await db.run(
    `
    UPDATE processing_task
    SET progress = 0.0, status = 'STARTED'
    WHERE book_uuid = $bookUuid
    `,
    {
      $bookUuid: bookUuid,
    },
  )
}

export async function updateTaskProgress(taskUuid: UUID, progress: number) {
  const db = await getDatabase()

  await db.run(
    `
    UPDATE processing_task
    SET progress = $progress
    WHERE uuid = $uuid
    `,
    {
      $progress: progress,
      $uuid: taskUuid,
    },
  )
}

export async function updateTaskStatus(
  taskUuid: UUID,
  status: ProcessingTaskStatus,
) {
  const db = await getDatabase()

  await db.run(
    `
    UPDATE processing_task
    SET status = $status
    WHERE uuid = $uuid
    `,
    {
      $status: status,
      $uuid: taskUuid,
    },
  )
}
