import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname } from "node:path"
import { type MessagePort } from "node:worker_threads"

import { AsyncSemaphore } from "@esfx/async-semaphore"
import { type RecognitionResult } from "echogarden"
import { extension } from "mime-types"

import { getAudioCoverFilepath, getFirstCoverImage } from "@/assets/covers"
import { deleteProcessed, getProcessedAudioFiles } from "@/assets/fs"
import { writeMetadataToEpub } from "@/assets/metadata"
import {
  getAlignmentReportFilepath,
  getProcessedAudioFilepath,
  getReadaloudFilepath,
  getTranscriptionFilename,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import {
  type Book,
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  getBookOrThrow,
} from "@/database/books"
import {
  formatTranscriptionEngineDetails,
  getSettings,
} from "@/database/settings"
import { type Settings } from "@/database/settingsTypes"
import { logger } from "@/logging"
import { getTranscriptions, processAudiobook } from "@/process/processAudio"
import { getFullText, readEpub } from "@/process/processEpub"
import { getInitialPrompt } from "@/process/prompt"
import { Synchronizer } from "@/synchronize/synchronizer"
import { installWhisper, transcribeTrack } from "@/transcribe"
import { type UUID } from "@/uuid"
import { getCurrentVersion } from "@/versions"

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

const STAGES = ["SPLIT_TRACKS", "TRANSCRIBE_CHAPTERS", "SYNC_CHAPTERS"] as const

export default async function processBook({
  bookUuid,
  restart,
  port,
}: {
  bookUuid: UUID
  restart: boolean
  port: MessagePort
}) {
  /**
   * Post a message to the main thread containing a readaloud
   * update for this book.
   *
   * @remarks
   *
   * We have the main thread manage these updates so that it can
   * trigger the BookEvents emitter on the main thread, and update
   * subscribers (i.e. the web client).
   */
  async function updateBook(
    update: BookUpdate | null,
    relations: BookRelationsUpdate = {},
  ) {
    const requestId = randomUUID()
    const promise = new Promise<BookWithRelations>((resolve) => {
      port.once(
        "message",
        (message: { requestId: UUID; book: BookWithRelations }) => {
          if (message.requestId === requestId) {
            resolve(message.book)
          }
        },
      )
    })

    port.postMessage({ requestId, update, relations })

    return await promise
  }

  let book = await getBookOrThrow(bookUuid)

  if (restart) {
    await deleteProcessed(book)
    book = await updateBook(null, {
      readaloud: {
        status: "PROCESSING",
        currentStage: "SPLIT_TRACKS",
        stageProgress: 0,
      },
    })
  } else {
    book = await updateBook(null, {
      readaloud: {
        status: "PROCESSING",
        currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
        stageProgress: 0,
      },
    })
  }

  // get book info from db
  // book reference to use in log
  const bookRefForLog = `"${book.title}" (uuid: ${bookUuid})`

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const stageIndex = STAGES.indexOf(book.readaloud!.currentStage)
  const remainingStages = STAGES.slice(stageIndex)

  for (const stage of remainingStages) {
    const onProgress = (progress: number) => {
      void updateBook(null, {
        readaloud: {
          status: "PROCESSING",
          currentStage: stage,
          stageProgress: progress,
        },
      })
    }

    try {
      if (stage === "SPLIT_TRACKS") {
        const settings = await getSettings()
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

      if (stage === "TRANSCRIBE_CHAPTERS") {
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

        const settings = await getSettings()
        await transcribeBook(book, initialPrompt, locale, settings, onProgress)
      }

      if (stage === "SYNC_CHAPTERS") {
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

        await mkdir(dirname(getAlignmentReportFilepath(book)), {
          recursive: true,
        })

        await writeFile(
          getAlignmentReportFilepath(book),
          JSON.stringify(synchronizer.report, null, 2),
          { encoding: "utf-8" },
        )

        const settings = await getSettings()

        book = await updateBook(null, {
          readaloud: {
            filepath: getReadaloudFilepath(book, settings),
            status: "ALIGNED",
            currentStage: stage,
            stageProgress: 1,
            queuePosition: 0,
            restartPending: null,
          },
        })

        book = await updateBook({
          alignedByStorytellerVersion: getCurrentVersion(),
          // We need UTC with integer seconds, but toISOString gives UTC with ms
          alignedAt: new Date().toISOString().replace(/\.\d+/, ""),
          alignedWith: formatTranscriptionEngineDetails(settings),
        })

        const coverFilepath = await getAudioCoverFilepath(book)
        let audioCover: File | null = null
        if (coverFilepath) {
          audioCover = new File(
            [await readFile(coverFilepath)],
            basename(coverFilepath),
          )
        } else {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const coverImage = await getFirstCoverImage(book.audiobook!.filepath)
          if (coverImage) {
            audioCover = new File(
              [coverImage.data],
              `Audio Cover.${extension(coverImage.format) || ".jpg"}`,
            )
          }
        }

        logger.info(
          `Writing metadata to aligned readaloud file (title: ${book.title})`,
        )
        await writeMetadataToEpub(book, epub, {
          includeAlignmentMetadata: true,
          ...(audioCover && { audioCover }),
        })
        logger.info(
          `Successfully wrote metadata to file (title: ${await epub.getTitle(true)})`,
        )

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const readaloudFilepath = book.readaloud!.filepath!
        const readaloudDirectory = dirname(readaloudFilepath)
        await mkdir(readaloudDirectory, { recursive: true })
        await epub.writeToFile(readaloudFilepath)
        await epub.close()
      }
    } catch (e) {
      logger.error(
        `Encountered error while running task "${stage}" for book ${bookUuid}`,
      )
      console.error(e)
      await updateBook(null, {
        readaloud: {
          status: "ERROR",
          currentStage: stage,
          queuePosition: null,
          restartPending: null,
        },
      })
      return
    }
  }
  logger.info(`Completed synchronizing book ${bookRefForLog}`)
}
