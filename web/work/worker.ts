import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import {
  PROCESSING_TASK_ORDER,
  createProcessingTask,
  getProcessingTasksForBook,
  resetProcessingTasksForBook,
  updateTaskProgress,
  updateTaskStatus,
  type ProcessingTask,
} from "@/database/processingTasks"
import {
  getProcessedAudioFilepath,
  getProcessedFiles,
  getTranscriptionFilename,
  getTranscriptions,
  getTranscriptionsFilepath,
  processAudiobook,
} from "@/process/processAudio"
import {
  getEpubSyncedFilepath,
  getFullText,
  processEpub,
  readEpub,
} from "@/process/processEpub"
import { getInitialPrompt } from "@/process/prompt"
import { getSyncCache } from "@/synchronize/syncCache"
import { Synchronizer } from "@/synchronize/synchronizer"
import {
  getTranscribeModel,
  getAlignModel,
  TranscriptionResult,
  transcribeTrack,
} from "@/transcribe"
import { UUID } from "@/uuid"
import { mkdir, writeFile } from "node:fs/promises"

const DEVICE = process.env["STORYTELLER_DEVICE"]
const BATCH_SIZE = parseInt(process.env["STORYTELLER_BATCH_SIZE"] ?? "16", 10)
const COMPUTE_TYPE = process.env["STORYTELLER_COMPUTE_TYPE"]

export async function transcribeBook(
  bookUuid: UUID,
  initialPrompt: string,
  device = "cpu",
  batchSize = 16,
  computeType = "int8",
  onProgress?: (progress: number) => void,
) {
  const transcriptionsPath = getTranscriptionsFilepath(bookUuid)
  await mkdir(transcriptionsPath, { recursive: true })
  const audioFiles = await getProcessedFiles(bookUuid)
  if (!audioFiles) {
    throw new Error("Failed to transcribe book: found no processed audio files")
  }

  const transcribeModel = getTranscribeModel(device, computeType, initialPrompt)
  const { alignModel, alignMetadata } = getAlignModel(device)

  const transcriptions: TranscriptionResult[] = []
  for (let i = 0; i < audioFiles.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const audioFile = audioFiles[i]!
    const filepath = getProcessedAudioFilepath(bookUuid, audioFile.filename)
    const transcription = transcribeTrack(
      filepath,
      device,
      transcribeModel,
      alignModel,
      alignMetadata,
      batchSize,
    )
    transcriptions.push(transcription)
    const transcriptionFilepath = getTranscriptionsFilepath(
      bookUuid,
      getTranscriptionFilename(audioFile),
    )
    await writeFile(transcriptionFilepath, JSON.stringify(transcription))
    onProgress?.((i + 1) / audioFiles.length)
  }
  return transcriptions
}

export function determineRemainingTasks(
  bookUuid: UUID,
  processingTasks: ProcessingTask[],
): Array<Omit<ProcessingTask, "uuid"> & { uuid?: UUID }> {
  const sortedTasks = [...processingTasks].sort(
    (taskA, taskB) =>
      PROCESSING_TASK_ORDER[taskA.type] - PROCESSING_TASK_ORDER[taskB.type],
  )

  if (sortedTasks.length === 0) {
    return Object.entries(PROCESSING_TASK_ORDER)
      .sort(([, orderA], [, orderB]) => orderA - orderB)
      .map(([type]) => ({
        type: type as ProcessingTaskType,
        status: ProcessingTaskStatus.STARTED,
        progress: 0,
        bookUuid,
      }))
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const lastCompletedTaskIndex =
    sortedTasks.findIndex(
      (task) => task.status === ProcessingTaskStatus.COMPLETED,
    ) ?? -1

  return (sortedTasks as Omit<ProcessingTask, "uuid">[])
    .slice(lastCompletedTaskIndex + 1)
    .concat(
      Object.entries(PROCESSING_TASK_ORDER)
        .sort(([, orderA], [, orderB]) => orderA - orderB)
        .slice(sortedTasks.length - lastCompletedTaskIndex)
        .map(([type]) => ({
          type: type as ProcessingTaskType,
          status: ProcessingTaskStatus.STARTED,
          progress: 0,
          bookUuid,
        })),
    )
}

export default async function processBook({
  bookUuid,
  restart,
}: {
  bookUuid: UUID
  restart: boolean
}) {
  if (restart) {
    await resetProcessingTasksForBook(bookUuid)
  }

  const currentTasks = await getProcessingTasksForBook(bookUuid)
  const remainingTasks = determineRemainingTasks(bookUuid, currentTasks)
  console.log(
    `Found ${remainingTasks.length} remaining tasks for book ${bookUuid}`,
  )
  for (const task of remainingTasks) {
    const taskUuid =
      task.uuid ??
      (await createProcessingTask(task.type, task.status, bookUuid))

    if (!task.uuid) {
      await updateTaskProgress(taskUuid, 0)
    }

    if (task.status !== ProcessingTaskStatus.STARTED) {
      await updateTaskStatus(taskUuid, ProcessingTaskStatus.STARTED)
    }

    const onProgress = (progress: number) =>
      updateTaskProgress(taskUuid, progress)

    try {
      if (task.type === ProcessingTaskType.SPLIT_CHAPTERS) {
        console.log("Pre-processing...")
        await processEpub(bookUuid)
        await processAudiobook(bookUuid, onProgress)
      }

      if (task.type === ProcessingTaskType.TRANSCRIBE_CHAPTERS) {
        console.log("Transcribing...")
        const epub = await readEpub(bookUuid)
        const title = await epub.getTitle()
        const fullText = await getFullText(epub)
        const initialPrompt = await getInitialPrompt(title ?? "", fullText)
        await transcribeBook(
          bookUuid,
          initialPrompt,
          DEVICE,
          BATCH_SIZE,
          COMPUTE_TYPE,
          onProgress,
        )
      }

      if (task.type === ProcessingTaskType.SYNC_CHAPTERS) {
        const epub = await readEpub(bookUuid)
        const audioFiles = await getProcessedFiles(bookUuid)
        const transcriptions = await getTranscriptions(bookUuid)
        if (!audioFiles) {
          throw new Error(`No audio files found for book ${bookUuid}`)
        }
        console.log("Syncing narration...")
        const syncCache = await getSyncCache(bookUuid)
        const synchronizer = new Synchronizer(
          epub,
          syncCache,
          audioFiles.map((audioFile) =>
            getProcessedAudioFilepath(bookUuid, audioFile.filename),
          ),
          transcriptions,
        )
        await synchronizer.syncBook(onProgress)
        await epub.writeToFile(getEpubSyncedFilepath(bookUuid))
        await epub.close()
      }

      await updateTaskStatus(taskUuid, ProcessingTaskStatus.COMPLETED)
    } catch (e) {
      console.error(
        `Encountered error while running task "${task.type}" for book ${bookUuid}`,
      )
      console.error(e)
      await updateTaskStatus(taskUuid, ProcessingTaskStatus.IN_ERROR)
    }
  }
}
