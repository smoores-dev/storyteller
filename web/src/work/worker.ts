import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"
import { getProcessedAudioFiles, deleteProcessed } from "@/assets/fs"
import {
  getTranscriptionsFilepath,
  getProcessedAudioFilepath,
  getInternalEpubAlignedFilepath,
} from "@/assets/paths"
import { Book, getBookOrThrow, updateBook } from "@/database/books"
import {
  NewProcessingTask,
  PROCESSING_TASK_ORDER,
  type ProcessingTask,
} from "@/database/processingTasks"
import { formatTranscriptionEngineDetails } from "@/database/settings"
import { Settings } from "@/database/settingsTypes"
import { logger } from "@/logging"
import {
  getTranscriptionFilename,
  getTranscriptions,
  processAudiobook,
} from "@/process/processAudio"
import {
  getFullText,
  readEpub,
  writeMetadataToEpub,
} from "@/process/processEpub"
import { getInitialPrompt } from "@/process/prompt"
import { Synchronizer } from "@/synchronize/synchronizer"
import { installWhisper, transcribeTrack } from "@/transcribe"
import { UUID } from "@/uuid"
import { getCurrentVersion } from "@/versions"
import { AsyncSemaphore } from "@esfx/async-semaphore"
import type { RecognitionResult } from "echogarden/dist/api/Recognition"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { MessagePort } from "node:worker_threads"

export async function transcribeBook(
  book: Book,
  initialPrompt: string | null,
  locale: Intl.Locale,
  settings: Settings,
  onProgress?: (progress: number) => void,
) {
  const semaphore = new AsyncSemaphore(settings.parallelTranscribes)
  const transcriptionsPath = getTranscriptionsFilepath(book)
  await mkdir(transcriptionsPath, { recursive: true })
  const audioFiles = await getProcessedAudioFiles(book)
  if (!audioFiles.length) {
    throw new Error("Failed to transcribe book: found no processed audio files")
  }

  if (
    !settings.transcriptionEngine ||
    settings.transcriptionEngine === "whisper.cpp"
  ) {
    await installWhisper(settings)
  }

  const transcriptions: Pick<
    RecognitionResult,
    "transcript" | "wordTimeline"
  >[] = []

  await Promise.all(
    audioFiles.map(async (audioFile) => {
      await semaphore.wait()
      try {
        const transcriptionFilepath = getTranscriptionsFilepath(
          book,
          getTranscriptionFilename(audioFile),
        )
        const filepath = getProcessedAudioFilepath(book, audioFile)
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
        onProgress?.((transcriptions.length + 1) / audioFiles.length)
      } finally {
        semaphore.release()
      }
    }),
  )
  return transcriptions
}

export function determineRemainingTasks(
  bookUuid: UUID,
  processingTasks: ProcessingTask[],
): Array<Omit<NewProcessingTask, "id">> {
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

  return (sortedTasks as Omit<NewProcessingTask, "id">[])
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
  let book = await getBookOrThrow(bookUuid)

  if (restart) {
    await deleteProcessed(book)
  }

  const currentTasks: ProcessingTask[] = await new Promise((resolve) => {
    port.once("message", resolve)
  })

  // const currentTasks = await getProcessingTasksForBook(bookUuid)
  const remainingTasks = determineRemainingTasks(bookUuid, currentTasks)

  // get book info from db
  // book reference to use in log
  const bookRefForLog = `"${book.title}" (uuid: ${bookUuid})`

  logger.info(
    `Found ${remainingTasks.length} remaining tasks for book ${bookRefForLog}`,
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
        await processAudiobook(
          book,
          settings.maxTrackLength ?? null,
          settings.codec ?? null,
          settings.bitrate ?? null,
          new AsyncSemaphore(settings.parallelTranscodes),
          onProgress,
        )
      }

      if (task.type === ProcessingTaskType.TRANSCRIBE_CHAPTERS) {
        logger.info("Transcribing...")
        const epub = await readEpub(book)
        const title = await epub.getTitle()
        book = await getBookOrThrow(bookUuid)

        const locale = book.language
          ? new Intl.Locale(book.language)
          : (await epub.getLanguage()) ?? new Intl.Locale("en-US")

        const fullText = await getFullText(epub)
        const initialPrompt =
          locale.language === "en"
            ? await getInitialPrompt(title ?? "", fullText)
            : null

        await transcribeBook(book, initialPrompt, locale, settings, onProgress)
      }

      if (task.type === ProcessingTaskType.SYNC_CHAPTERS) {
        const epub = await readEpub(book)
        const audioFiles = await getProcessedAudioFiles(book)
        book = await getBookOrThrow(bookUuid)
        const transcriptions = await getTranscriptions(book)
        if (!audioFiles.length) {
          throw new Error(`No audio files found for book ${bookUuid}`)
        }
        logger.info("Syncing narration...")
        const synchronizer = new Synchronizer(
          epub,
          await Promise.all(
            audioFiles.map((audioFile) =>
              getProcessedAudioFilepath(book, audioFile),
            ),
          ),
          transcriptions,
        )
        await synchronizer.syncBook(onProgress)

        book = await updateBook(bookUuid, {
          alignedByStorytellerVersion: getCurrentVersion(),
          // We need UTC with integer seconds, but toISOString gives UTC with ms
          alignedAt: new Date().toISOString().replace(/\.\d+/, ""),
          alignedWith: formatTranscriptionEngineDetails(settings),
        })

        await writeMetadataToEpub(book, epub)

        await epub.writeToFile(getInternalEpubAlignedFilepath(book))
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
      console.error(e)
      port.postMessage({
        type: "processingFailed",
        bookUuid,
        payload: { taskUuid },
      })
      return
    }
  }
  logger.info(`Completed synchronizing book ${bookRefForLog})`)
  port.postMessage({ type: "processingCompleted", bookUuid })
}
