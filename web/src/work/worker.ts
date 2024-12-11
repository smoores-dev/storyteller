import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import { deleteProcessed } from "@/assets/assets"
import { getProcessedAudioFiles } from "@/assets/covers"
import {
  getTranscriptionsFilepath,
  getProcessedAudioFilepath,
  getEpubSyncedFilepath,
} from "@/assets/paths"
import { getBooks } from "@/database/books"
import {
  PROCESSING_TASK_ORDER,
  type ProcessingTask,
} from "@/database/processingTasks"
import { Settings } from "@/database/settings"
import { logger } from "@/logging"
import {
  getTranscriptionFilename,
  getTranscriptions,
  processAudiobook,
} from "@/process/processAudio"
import { getFullText, processEpub, readEpub } from "@/process/processEpub"
import { getInitialPrompt } from "@/process/prompt"
import { getSyncCache } from "@/synchronize/syncCache"
import { Synchronizer } from "@/synchronize/synchronizer"
import { transcribeTrack } from "@/transcribe"
import { UUID } from "@/uuid"
import type { RecognitionResult } from "echogarden/dist/api/Recognition"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { MessagePort } from "node:worker_threads"

// const DEVICE = process.env["STORYTELLER_DEVICE"] as WhisperCppBuild | undefined

export async function transcribeBook(
  bookUuid: UUID,
  initialPrompt: string | null,
  locale: Intl.Locale,
  settings: Settings,
  onProgress?: (progress: number) => void,
) {
  const transcriptionsPath = getTranscriptionsFilepath(bookUuid)
  await mkdir(transcriptionsPath, { recursive: true })
  const audioFiles = await getProcessedAudioFiles(bookUuid)
  if (!audioFiles) {
    throw new Error("Failed to transcribe book: found no processed audio files")
  }

  const transcriptions: Pick<
    RecognitionResult,
    "transcript" | "wordTimeline"
  >[] = []
  for (let i = 0; i < audioFiles.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const audioFile = audioFiles[i]!
    const transcriptionFilepath = getTranscriptionsFilepath(
      bookUuid,
      getTranscriptionFilename(audioFile),
    )
    const filepath = getProcessedAudioFilepath(bookUuid, audioFile.filename)
    try {
      const existingTranscription = await readFile(transcriptionFilepath, {
        encoding: "utf-8",
      })
      logger.info(`Found existing transcription for ${filepath}`)
      transcriptions.push(
        JSON.parse(existingTranscription) as Pick<
          RecognitionResult,
          "transcript" | "wordTimeline"
        >,
      )
    } catch (_) {
      const transcription = await transcribeTrack(
        filepath,
        initialPrompt,
        locale,
        settings,
      )
      transcriptions.push(transcription)
      await writeFile(
        transcriptionFilepath,
        JSON.stringify({
          transcript: transcription.transcript,
          wordTimeline: transcription.wordTimeline,
        }),
      )
    }
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
  const lastCompletedTaskIndex = sortedTasks.findLastIndex(
    (task) => task.status === ProcessingTaskStatus.COMPLETED,
  )

  return (sortedTasks as Omit<ProcessingTask, "uuid">[])
    .slice(lastCompletedTaskIndex + 1)
    .concat(
      Object.entries(PROCESSING_TASK_ORDER)
        .sort(([, orderA], [, orderB]) => orderA - orderB)
        .slice(sortedTasks.length)
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
  settings,
  port,
}: {
  bookUuid: UUID
  restart: boolean
  settings: Settings
  port: MessagePort
}) {
  port.postMessage({ type: "processingStarted", bookUuid })

  if (restart) {
    await deleteProcessed(bookUuid)
  }

  const currentTasks: ProcessingTask[] = await new Promise((resolve) => {
    port.once("message", resolve)
  })

  // const currentTasks = await getProcessingTasksForBook(bookUuid)
  const remainingTasks = determineRemainingTasks(bookUuid, currentTasks)

  logger.info(
    `Found ${remainingTasks.length} remaining tasks for book ${bookUuid}`,
  )
  for (const task of remainingTasks) {
    port.postMessage({
      type: "taskTypeUpdated",
      bookUuid,
      payload: {
        taskUuid: task.uuid,
        taskType: task.type,
        taskStatus: task.status,
      },
    })

    const taskUuid: UUID = await new Promise((resolve) => {
      port.once("message", resolve)
    })

    const onProgress = (progress: number) => {
      port.postMessage({
        type: "taskProgressUpdated",
        bookUuid,
        payload: { taskUuid, progress },
      })
    }

    try {
      if (task.type === ProcessingTaskType.SPLIT_CHAPTERS) {
        logger.info("Pre-processing...")
        await processEpub(bookUuid)
        await processAudiobook(
          bookUuid,
          settings.maxTrackLength ?? null,
          settings.codec ?? null,
          settings.bitrate ?? null,
          onProgress,
        )
      }

      if (task.type === ProcessingTaskType.TRANSCRIBE_CHAPTERS) {
        logger.info("Transcribing...")
        const epub = await readEpub(bookUuid)
        const title = await epub.getTitle()
        const [book] = getBooks([bookUuid])
        if (!book)
          throw new Error(`Failed to retrieve book with uuid ${bookUuid}`)

        const locale = book.language
          ? new Intl.Locale(book.language)
          : (await epub.getLanguage()) ?? new Intl.Locale("en-US")

        const fullText = await getFullText(epub)
        const initialPrompt =
          locale.language === "en"
            ? await getInitialPrompt(title ?? "", fullText)
            : null

        await transcribeBook(
          bookUuid,
          initialPrompt,
          locale,
          settings,
          onProgress,
        )
      }

      if (task.type === ProcessingTaskType.SYNC_CHAPTERS) {
        const epub = await readEpub(bookUuid)
        const audioFiles = await getProcessedAudioFiles(bookUuid)
        const transcriptions = await getTranscriptions(bookUuid)
        if (!audioFiles) {
          throw new Error(`No audio files found for book ${bookUuid}`)
        }
        logger.info("Syncing narration...")
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
        const [book] = getBooks([bookUuid])

        if (!book)
          throw new Error(`Failed to retrieve book with uuid ${bookUuid}`)

        await epub.setTitle(book.title)
        if (book.language) {
          await epub.setLanguage(book.language)
        }
        await epub.writeToFile(getEpubSyncedFilepath(bookUuid))
        await epub.close()
      }

      port.postMessage({
        type: "taskCompleted",
        bookUuid,
        payload: { taskUuid },
      })
    } catch (e) {
      logger.error(
        `Encountered error while running task "${task.type}" for book ${bookUuid}`,
      )
      logger.error(e)
      port.postMessage({
        type: "processingFailed",
        bookUuid,
        payload: { taskUuid },
      })
      return
    }
  }
  logger.info(`Completed synchronizing book ${bookUuid}`)
  port.postMessage({ type: "processingCompleted", bookUuid })
}
