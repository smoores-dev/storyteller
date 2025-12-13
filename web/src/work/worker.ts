import { randomUUID } from "node:crypto"
import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname } from "node:path"
import type { MessagePort } from "node:worker_threads"

import { AsyncSemaphore } from "@esfx/async-semaphore"
import type { RecognitionResult } from "echogarden"
import { extension } from "mime-types"

import { Epub } from "@storyteller-platform/epub"

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
import type { Settings } from "@/database/settingsTypes"
import { logger } from "@/logging"
import { getTranscriptions, processAudiobook } from "@/process/processAudio"
import { Synchronizer } from "@/synchronize/synchronizer"
import { installWhisper, transcribeTrack } from "@/transcribe"
import type { UUID } from "@/uuid"
import { getCurrentVersion } from "@/versions"

export async function transcribeBook(
  book: Book,
  locale: Intl.Locale,
  settings: Settings,
  onProgress?: (progress: number) => void,
) {
  if (process.env["DEBUG_TRANSCRIBE"] === "true") {
    const inspector = await import("node:inspector")
    inspector.open(9231, "0.0.0.0", true)
  }
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

  const abortController = new AbortController()
  const { signal } = abortController
  const hasFailed = () => signal.aborted // <- otherwise incorrect type narrowing when checking signal.aborted

  try {
    await Promise.all(
      audioFiles.map(async (audioFile) => {
        await semaphore.wait()

        if (hasFailed()) {
          semaphore.release()
          return
        }

        try {
          const transcriptionFilepath = getTranscriptionsFilepath(
            book,
            getTranscriptionFilename(audioFile),
          )
          const filepath = getProcessedAudioFilepath(book, audioFile)
          try {
            const existingTranscription = await readFile(
              transcriptionFilepath,
              {
                encoding: "utf-8",
                signal,
              },
            )
            logger.info(`Found existing transcription for ${filepath}`)
            transcriptions.push(
              JSON.parse(existingTranscription) as Pick<
                RecognitionResult,
                "transcript" | "wordTimeline"
              >,
            )
          } catch (_) {
            if (hasFailed()) {
              return
            }

            try {
              const transcription = await transcribeTrack(
                filepath,
                locale,
                settings,
              )

              if (hasFailed()) {
                return
              }

              transcriptions.push(transcription)
              await writeFile(
                transcriptionFilepath,
                JSON.stringify({
                  transcript: transcription.transcript,
                  wordTimeline: transcription.wordTimeline,
                }),
                { signal },
              )
            } catch (e) {
              logger.error({ msg: `Failed to transcribe ${filepath}`, err: e })
              abortController.abort(e)
              throw e
            }
          }
          onProgress?.((transcriptions.length + 1) / audioFiles.length)
        } finally {
          semaphore.release()
        }
      }),
    )
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Transcription was aborted due to a failure: ${e.message}`,
        { cause: e },
      )
    }
    throw e
  }
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
      function listener(message: { requestId: UUID; book: BookWithRelations }) {
        if (message.requestId === requestId) {
          port.off("message", listener)
          resolve(message.book)
        }
      }
      port.on("message", listener)
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        using epub = await Epub.from(book.ebook!.filepath)
        book = await getBookOrThrow(bookUuid)

        const locale = book.language
          ? new Intl.Locale(book.language)
          : (await epub.getLanguage()) ?? new Intl.Locale("en-US")

        const settings = await getSettings()
        await transcribeBook(book, locale, settings, onProgress)
      }

      if (stage === "SYNC_CHAPTERS") {
        const settings = await getSettings()
        const readaloudFilepath = getReadaloudFilepath(book, settings)
        const readaloudDirectory = dirname(readaloudFilepath)
        await mkdir(readaloudDirectory, { recursive: true })
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await cp(book.ebook!.filepath, readaloudFilepath, { force: true })

        using epub = await Epub.from(readaloudFilepath)
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

        book = await updateBook(null, {
          readaloud: {
            filepath: readaloudFilepath,
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
            [new Uint8Array(await readFile(coverFilepath))],
            basename(coverFilepath),
          )
        } else {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const coverImage = await getFirstCoverImage(book.audiobook!.filepath)
          if (coverImage) {
            audioCover = new File(
              [new Uint8Array(coverImage.data)],
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

        await epub.saveAndClose()
      }
    } catch (e) {
      logger.error({
        msg: `Encountered error while running task "${stage}" for book ${bookUuid}`,
        err: e,
      })

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
