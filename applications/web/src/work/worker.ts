import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rm } from "node:fs/promises"
import { dirname } from "node:path"
import type { MessagePort } from "node:worker_threads"

import {
  align,
  ctcAlign,
  emit,
  markup,
  processAudiobook,
  transcribe,
} from "@storyteller-platform/align"
import { Epub, MemoryAdapter } from "@storyteller-platform/epub"
import { scratchPath } from "@storyteller-platform/fs"
import {
  createTiming,
  formatSingleReport,
  resolveCtcDevice,
} from "@storyteller-platform/ghost-story"
import { isCtcModelVariant } from "@storyteller-platform/ghost-story/constants"

import { getExtractedCover } from "@/assets/covers"
import {
  deleteProcessed,
  deleteProcessedAudio,
  deleteTranscriptions,
} from "@/assets/fs"
import { writeMetadataToEpub } from "@/assets/metadata"
import {
  getAlignmentReportFilepath,
  getEmissionsFilepath,
  getProcessedAudioFilepath,
  getReadaloudFilepath,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import { getAlignmentDecisions } from "@/database/alignmentDecisions"
import {
  type AnyReport,
  createAlignmentReport,
} from "@/database/alignmentReports"
import {
  type BookRelationsUpdate,
  type BookUpdate,
  type BookWithRelations,
  getBookOrThrow,
} from "@/database/books"
import {
  formatTranscriptionEngineDetails,
  getSetting,
  getSettings,
} from "@/database/settings"
import { env } from "@/env"
import { logger } from "@/logging"
import type { UUID } from "@/uuid"
import { getCurrentVersion } from "@/versions"
import { rangeBehaviourSettings } from "@/work/rangeBehaviour"

import type { ControlMessage, RestartMode } from "./distributor"
import {
  type AlignmentJobSummary,
  type JobStats,
  buildJobStats,
} from "./jobStats"
import type { RunConfig } from "./runConfig"

const STAGES = ["SPLIT_TRACKS", "TRANSCRIBE_CHAPTERS", "SYNC_CHAPTERS"] as const

if (process.env["DEBUG_WORKER"] === "true") {
  void import("node:inspector").then(({ default: inspector }) =>
    inspector.open(9231, "0.0.0.0", true),
  )
}

export default async function processBook({
  jobUuid,
  bookUuid,
  restart,
  config,
  port,
}: {
  jobUuid: UUID
  bookUuid: UUID
  restart: RestartMode
  config: RunConfig | null
  port: MessagePort
}): Promise<JobStats | undefined> {
  const abort = new AbortController()
  const { signal } = abort
  port.on("message", (message: Partial<ControlMessage> | null) => {
    if (message?.type === "abort") {
      abort.abort(new DOMException("Processing stopped by user", "AbortError"))
    }
  })

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

  async function getEffectiveSettings() {
    const settings = await getSettings()
    return config ? { ...settings, ...config } : settings
  }

  let book = await getBookOrThrow(bookUuid)
  let alignmentSummary: AlignmentJobSummary | null = null

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
  } else if (restart === "transcode") {
    await processTiming.timeAsync("delete_transcoded_audio", () =>
      deleteProcessedAudio(book),
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

  const runLanguage = config?.language ?? book.language
  let locale: Intl.Locale
  if (runLanguage) {
    locale = new Intl.Locale(runLanguage)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    using epub = await Epub.from(book.ebook!.filepath)
    locale = (await epub.getLanguage()) ?? new Intl.Locale("en-US")
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const stageIndex = STAGES.indexOf(book.readaloud!.currentStage)

  const alignerSettings = await getEffectiveSettings()
  const alignerInputDir =
    alignerSettings.aligner === "ctc"
      ? getEmissionsFilepath(book)
      : getTranscriptionsFilepath(book)
  const alignerInputCount = await readdir(alignerInputDir).then(
    (filenames) =>
      filenames.filter((f) => f.endsWith(".json") || f.endsWith(".emissions"))
        .length,
    () => 0,
  )

  const transcribeIndex = STAGES.indexOf("TRANSCRIBE_CHAPTERS")
  const startIndex =
    stageIndex > transcribeIndex && alignerInputCount === 0
      ? transcribeIndex
      : stageIndex

  if (startIndex < stageIndex) {
    logger.info(
      `No ${alignerSettings.aligner === "ctc" ? "emissions" : "transcriptions"} on disk for ${bookRefForLog}, restarting from the transcription step`,
    )
    book = await updateBook(null, {
      readaloud: {
        status: "PROCESSING",
        currentStage: "TRANSCRIBE_CHAPTERS",
        stageProgress: 0,
      },
    })
  }

  const remainingStages = STAGES.slice(startIndex)

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
      signal.throwIfAborted()

      if (stage === "SPLIT_TRACKS") {
        await deleteProcessedAudio(book)

        const settings = await getEffectiveSettings()
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
              signal,
            },
          ),
        )
      }

      if (stage === "TRANSCRIBE_CHAPTERS") {
        book = await getBookOrThrow(bookUuid)

        const settings = await getEffectiveSettings()

        let previousProgress = 0
        // prevent excessive progress updates
        const progressCallback = (progress: number) => {
          if (Math.floor(progress * 100) > Math.floor(previousProgress * 100)) {
            previousProgress = progress
            onProgress(progress)
          }
        }

        if (settings.aligner === "ctc") {
          logger.info("Generating emissions...")
          const device = resolveCtcDevice(
            settings.ctcDevice,
            env.STORYTELLER_WHISPER_VARIANT,
          )
          const family = settings.ctcModel ?? "quartznet15x5"
          const model =
            family === "mms" ||
            isCtcModelVariant(`${family}_${locale.language}`)
              ? family
              : "mms"
          if (model !== family) {
            logger.warn(
              `${family} has no ${locale.language} model, using mms for ${bookRefForLog}`,
            )
          }
          await processTiming.timeAsync("transcribe_chapters", () =>
            emit(getProcessedAudioFilepath(book), getEmissionsFilepath(book), {
              engine: settings.ctcEngine ?? "ctc-local",
              device,
              model,
              dtype: settings.ctcDtype,
              batchSize: settings.ctcBatchSize,
              language: locale,
              // serverUrl: settings.ctcServerUrl,
              // serverApiKey: settings.ctcServerApiKey,
              onProgress: progressCallback,
              logger,
              signal,
            }),
          )
        } else {
          logger.info("Transcribing...")
          await processTiming.timeAsync("transcribe_chapters", () =>
            transcribe(
              getProcessedAudioFilepath(book),
              getTranscriptionsFilepath(book),
              locale,
              {
                onProgress: progressCallback,
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
                amazonTranscribeAccessKeyId:
                  settings.amazonTranscribeAccessKeyId,
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
                signal,
              },
            ),
          )
        }
      }

      if (stage === "SYNC_CHAPTERS") {
        await processTiming.timeAsync("sync", async () => {
          const markupFilepath = scratchPath(
            `storyteller-${randomUUID()}`,
            `${book.uuid}.epub`,
          )

          const settings = await getEffectiveSettings()
          const decisions = await getAlignmentDecisions(bookUuid)
          const readaloudFilepath = getReadaloudFilepath(book, settings)
          const readaloudDirectory = dirname(readaloudFilepath)
          await mkdir(readaloudDirectory, { recursive: true })

          using epub = await Epub.using(MemoryAdapter).from(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            book.ebook!.filepath,
          )
          const runLanguage = config?.language ?? book.language
          const locale = runLanguage
            ? new Intl.Locale(runLanguage)
            : ((await epub.getLanguage()) ?? new Intl.Locale("en-US"))

          const reportFilepath = getAlignmentReportFilepath(book)
          try {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await markup(book.ebook!.filepath, markupFilepath, {
              onProgress: (p) => {
                onProgress(p * 0.15)
              },
              logger,
              granularity: settings.alignmentGranularity ?? "sentence",
              primaryLocale: locale,
            })

            signal.throwIfAborted()

            if (settings.aligner === "ctc") {
              await ctcAlign(
                markupFilepath,
                readaloudFilepath,
                getEmissionsFilepath(book),
                getProcessedAudioFilepath(book),
                {
                  granularity: settings.alignmentGranularity ?? "sentence",
                  reportsPath: reportFilepath,
                  logger,
                  onProgress: (p) => {
                    onProgress(0.15 + p * 0.85)
                  },
                  primaryLocale: locale,
                  signal,
                  ...rangeBehaviourSettings(settings),
                  decisions,
                },
              )
            } else {
              await align(
                markupFilepath,
                readaloudFilepath,
                getTranscriptionsFilepath(book),
                getProcessedAudioFilepath(book),
                {
                  granularity: "sentence",
                  reportsPath: reportFilepath,
                  logger,
                  onProgress: (p) => {
                    onProgress(0.15 + p * 0.85)
                  },
                  primaryLocale: locale,
                  signal,
                  ...rangeBehaviourSettings(settings),
                  decisions,
                },
              )
            }
          } finally {
            await rm(dirname(markupFilepath), { recursive: true, force: true })
          }

          try {
            const reportJson = await readFile(reportFilepath, {
              encoding: "utf-8",
            })

            const { summary } = await createAlignmentReport({
              jobUuid,
              bookUuid,
              report: JSON.parse(reportJson) as AnyReport,
            })
            alignmentSummary = summary
          } catch (err) {
            logger.warn({
              msg: "Failed to persist alignment report",
              bookUuid,
              err,
            })
          }

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

          const extractedCover = await getExtractedCover(book, "audiobook")
          const audioCover = extractedCover
            ? new File(
                [new Uint8Array(extractedCover.data)],
                extractedCover.filename,
              )
            : null

          logger.info(
            `Writing metadata to aligned readaloud file (title: ${book.title})`,
          )

          using readaloudEpub = await Epub.from(readaloudFilepath)
          await writeMetadataToEpub(book, readaloudEpub, {
            includeAlignmentMetadata: true,
            ...(audioCover && { audioCover }),
            format: "readaloud",
          })
          logger.info(
            `Successfully wrote metadata to file (title: ${await readaloudEpub.getTitle(true)})`,
          )

          await readaloudEpub.saveAndClose()

          const shouldCleanCache = await getSetting("cleanCacheAfterReadaloud")

          if (shouldCleanCache) {
            logger.info("Cleaning up cache files after successful alignment")
            await deleteProcessed(book)
          }
        })
      }
    } catch (e) {
      if (signal.aborted) throw signal.reason

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

  const summary = processTiming.summary()

  logger.info(formatSingleReport(summary, `Process Book: ${book.title}`))

  logger.info(`Completed synchronizing book ${bookRefForLog}`)

  return buildJobStats(summary, {
    audioDurationSeconds: book.audiobook?.duration ?? null,
    pageCount: book.ebook?.pageCount ?? null,
    alignment: alignmentSummary,
  })
}
