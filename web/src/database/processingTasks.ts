import { UUID } from "@/uuid"
import { db } from "./connection"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import { Insertable, Selectable } from "kysely"
import { DB } from "./schema"

export const PROCESSING_TASK_ORDER = {
  [ProcessingTaskType.SPLIT_CHAPTERS]: 0,
  [ProcessingTaskType.TRANSCRIBE_CHAPTERS]: 1,
  [ProcessingTaskType.SYNC_CHAPTERS]: 2,
}

export type ProcessingTask = Selectable<DB["processingTask"]>
export type NewProcessingTask = Insertable<DB["processingTask"]>

export async function createProcessingTask(
  type: ProcessingTaskType,
  status: ProcessingTaskStatus,
  bookUuid: UUID,
) {
  const { uuid } = await db
    .insertInto("processingTask")
    .values({ type, status, bookUuid })
    .returning(["uuid as uuid"])
    .executeTakeFirstOrThrow()

  return uuid
}

export async function getProcessingTasksForBook(bookUuid: UUID) {
  return await db
    .selectFrom("processingTask")
    .select(["uuid", "type", "status", "progress", "bookUuid"])
    .where("bookUuid", "=", bookUuid)
    .execute()
}

export async function resetProcessingTasksForBook(bookUuid: UUID) {
  await db
    .updateTable("processingTask")
    .set({ progress: 0, status: ProcessingTaskStatus.STARTED })
    .where("bookUuid", "=", bookUuid)
    .execute()
}

export async function updateTaskProgress(taskUuid: UUID, progress: number) {
  await db
    .updateTable("processingTask")
    .set({ progress })
    .where("uuid", "=", taskUuid)
    .execute()
}

export async function updateTaskStatus(
  taskUuid: UUID,
  status: ProcessingTaskStatus,
) {
  await db
    .updateTable("processingTask")
    .set({ status })
    .where("uuid", "=", taskUuid)
    .execute()
}
