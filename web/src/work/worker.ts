import { randomUUID } from "node:crypto"
import { mkdir, readFile } from "node:fs/promises"
import { basename, dirname } from "node:path"
import type { MessagePort } from "node:worker_threads"

import { extension } from "mime-types"

import {
  align,
  markup,
  processAudiobook,
  transcribe,
} from "@storyteller-platform/align"
import { Epub } from "@storyteller-platform/epub"
import {
  createTiming,
  formatSingleReport,
} from "@storyteller-platform/ghost-story"

import { getAudioCoverFilepath, getFirstCoverImage } from "@/assets/covers"
import { deleteProcessed, deleteTranscriptions } from "@/assets/fs"
import { writeMetadataToEpub } from "@/assets/metadata"
import {
  getAlignmentReportFilepath,
  getProcessedAudioFilepath,
  getReadaloudFilepath,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  getBookOrThrow,
} from "@/database/books"
import {
  formatTranscriptionEngineDetails,
  getSettings,
} from "@/database/settings"
import { env } from "@/env"
import { logger } from "@/logging"
import type { UUID } from "@/uuid"
import { getCurrentVersion } from "@/versions"

import type { RestartMode } from "./distributor"

const STAGES = ["SPLIT_TRACKS", "TRANSCRIBE_CHAPTERS", "SYNC_CHAPTERS"] as const

export default async function processBook({
  bookUuid,
  restart,
  port,
}: {
  bookUuid: UUID
  restart: RestartMode
  port: MessagePort
}) {
  const processTiming = createTiming()
  processTiming.setMetadata("bookUuid", bookUuid)
  processTiming.setMetadata("restartMode", restart || "continue")

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

  if (restart === "full") {
    await processTiming.timeAsync("delete_all_cache", () =>
      deleteProcessed(book),
    )
    book = await updateBook(null, {
      readaloud: {
        status: "PROCESSING",
        currentStage: "SPLIT_TRACKS",
        stageProgress: 0,
      },
    })
  } else if (restart === "transcription") {
    await processTiming.timeAsync("delete_transcriptions", () =>
      deleteTranscriptions(book),
    )
    book = await updateBook(null, {
      readaloud: {
        status: "PROCESSING",
        currentStage: "TRANSCRIBE_CHAPTERS",
        stageProgress: 0,
      },
    })
  } else if (restart === "sync") {
    book = await updateBook(null, {
      readaloud: {
        status: "PROCESSING",
        currentStage: "SYNC_CHAPTERS",
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
        await processTiming.timeAsync("split_tracks", () =>
          processAudiobook(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            book.audiobook!.filepath,
            getProcessedAudioFilepath(book),
            {
              maxLength: settings.maxTrackLength,
              parallelism: settings.parallelTranscodes,
              encoding: {
                codec: settings.codec,
                bitrate: settings.bitrate,
              },
              logger,
              onProgress,
            },
          ),
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
        await processTiming.timeAsync("transcribe_chapters", () =>
          transcribe(
            getProcessedAudioFilepath(book),
            getTranscriptionsFilepath(book),
            locale,
            {
              onProgress,
              engine: settings.transcriptionEngine,
              parallelism: settings.parallelTranscribes,
              model: settings.whisperModel,
              processors: settings.whisperThreads,
              threads: settings.whisperThreads * 4,
              whisperCpuOverride: settings.whisperCpuFallback,
              logger,
              googleCloudApiKey: settings.googleCloudApiKey,
              azureServiceRegion: settings.azureServiceRegion,
              azureSubscriptionKey: settings.azureSubscriptionKey,
              amazonTranscribeRegion: settings.amazonTranscribeRegion,
              amazonTranscribeAccessKeyId: settings.amazonTranscribeAccessKeyId,
              amazonTranscribeSecretAccessKey:
                settings.amazonTranscribeSecretAccessKey,
              amazonTranscribeBucketName: settings.amazonTranscribeBucketName,
              openAiApiKey: settings.openAiApiKey,
              openAiOrganization: settings.openAiOrganization,
              openAiBaseUrl: settings.openAiBaseUrl,
              openAiModelName: settings.openAiModelName,
              whisperServerUrl: settings.whisperServerUrl,
              whisperServerApiKey: settings.whisperServerApiKey,
              deepgramApiKey: settings.deepgramApiKey,
              deepgramModel: settings.deepgramModel,
            },
          ),
        )
      }

      if (stage === "SYNC_CHAPTERS") {
        const settings = await getSettings()
        const readaloudFilepath = getReadaloudFilepath(book, settings)
        const readaloudDirectory = dirname(readaloudFilepath)
        await mkdir(readaloudDirectory, { recursive: true })

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await markup(book.ebook!.filepath, readaloudFilepath, {
          onProgress,
          logger,
        })

        await align(
          readaloudFilepath,
          readaloudFilepath,
          getTranscriptionsFilepath(book),
          getProcessedAudioFilepath(book),
          {
            granularity: "sentence",
            reportsPath: getAlignmentReportFilepath(book),
            logger,
            onProgress,
          },
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

        using epub = await Epub.from(readaloudFilepath)
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

  const enableTiming = env.STORYTELLER_LOG_LEVEL === "debug"
  if (enableTiming) {
    logger.info(
      formatSingleReport(
        processTiming.summary(),
        `Process Book: ${book.title}`,
      ),
    )
  }

  logger.info(`Completed synchronizing book ${bookRefForLog}`)
}
