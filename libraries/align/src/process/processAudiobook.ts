import { mkdir, readdir } from "node:fs/promises"
import { extname, join } from "node:path"

import { AsyncSemaphore } from "@esfx/async-semaphore"
import { type Logger } from "pino"

import {
  AUDIO_ENCODERS,
  Audiobook,
  outputContainer,
} from "@storyteller-platform/audiobook"
import {
  type TimingAggregator,
  createAggregator,
  createTiming,
} from "@storyteller-platform/ghost-story"
import { MediaType } from "@storyteller-platform/media-types"

import {
  getTrackInfo,
  isVbrMp3,
  selectCbrBitrate,
  splitFile,
} from "../common/ffmpeg.ts"

import { type AudioEncoding } from "./AudioEncoding.ts"
import { getSafeChapterRanges } from "./ranges.ts"

export interface ProcessOptions {
  maxLength?: number | null | undefined
  encoding?: AudioEncoding | null | undefined
  parallelism?: number | null | undefined
  signal?: AbortSignal | null | undefined
  onProgress?: ((progress: number) => void) | null | undefined
  logger?: Logger | null | undefined
}

export async function processAudiobook(
  input: string,
  output: string,
  options: ProcessOptions,
): Promise<TimingAggregator> {
  const timing = createAggregator()
  timing.setMetadata("codec", options.encoding?.codec ?? "unspecified")
  timing.setMetadata("bitrate", options.encoding?.bitrate ?? "unspecified")
  timing.setMetadata("max-length", `${(options.maxLength ?? 2) * 60} minutes`)

  await mkdir(output, { recursive: true })

  const allFiles = await readdir(input, { recursive: true })
  const filenames = allFiles.filter((f) => {
    const kind = MediaType.fromPath(f)?.kind
    return kind === "audio" || kind === "archive"
  })
  options.logger?.debug(`Found ${filenames.length} files to process`)

  const outputFiles: string[] = []

  const controller = new AbortController()
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    controller.signal,
  ])

  const semaphore = new AsyncSemaphore(options.parallelism ?? 1)

  const perFileProgress = new Map<number, number>()

  await Promise.all(
    filenames
      .map(async (filename, index) => {
        if (signal.aborted) throw new Error("Aborted")

        const filepath = join(input, filename)

        function onFileProgress(progress: number) {
          perFileProgress.set(index, progress)
          const updatedProgress =
            Array.from(perFileProgress.values()).reduce((acc, p) => acc + p) /
            filenames.length
          options.logger?.info(
            `Progress: ${Math.floor(updatedProgress * 100)}%`,
          )
          options.onProgress?.(updatedProgress)
        }

        const fileOptions = {
          ...options,
          signal,
          lock: semaphore,
          onProgress: onFileProgress,
        }

        const { processedFiles, timing: fileTiming } = await processFile(
          filepath,
          output,
          (index + 1).toString().padStart(5, "0") + "-",
          fileOptions,
        )
        timing.add(fileTiming.summary())
        outputFiles.push(...processedFiles)
      })
      .map((p) =>
        p.catch((e: unknown) => {
          controller.abort(e)
          throw e
        }),
      ),
  )

  return timing
}

interface ProcessFileOptions extends Omit<ProcessOptions, "parallelism"> {
  lock: AsyncSemaphore
}

async function resolveVbrEncoding(
  filepath: string,
  userEncoding: AudioEncoding | null | undefined,
  logger?: Logger | null,
): Promise<AudioEncoding | null | undefined> {
  if (userEncoding?.codec && userEncoding.codec !== AUDIO_ENCODERS.mp3) {
    return userEncoding
  }

  const sourceIsMp3 = MediaType.fromPath(filepath) === MediaType.MPEG_AUDIO

  if (!userEncoding?.codec && !sourceIsMp3) {
    return userEncoding
  }

  if (!userEncoding?.codec && !(await isVbrMp3(filepath))) {
    return userEncoding
  }

  const trackInfo = await getTrackInfo(filepath, logger ?? undefined)
  const targetBitrate = selectCbrBitrate(trackInfo.bitRate)

  logger?.info(
    `Forcing CBR MP3 for ${filepath} (avg ${trackInfo.bitRate}bps) at ${targetBitrate / 1000}k`,
  )

  return {
    codec: AUDIO_ENCODERS.mp3,
    bitrate: `${targetBitrate / 1000}k`,
  }
}

export async function processFile(
  input: string,
  output: string,
  prefix: string,
  options: ProcessFileOptions,
) {
  const timing = createTiming()
  const outputFiles: string[] = []

  using audiobook = await Audiobook.from(input)

  const maxHours = options.maxLength ?? 2
  const maxSeconds = 60 * 60 * maxHours

  const duration = await audiobook.getDuration()
  const chapters = await audiobook.getChapters()

  const ranges = await getSafeChapterRanges(
    input,
    duration,
    chapters,
    maxSeconds,
    options.signal,
    options.logger,
  )

  // pre-check each unique source file for vbr so we only probe once per file
  // one file can have multiple ranges depending on the size/max length setting
  const vbrEncodings = new Map<string, AudioEncoding | null | undefined>()

  const uniqueFilepaths = [...new Set(ranges.map((r) => r.filepath))]
  await Promise.all(
    uniqueFilepaths.map(async (filepath) => {
      const result = await resolveVbrEncoding(
        filepath,
        options.encoding,
        options.logger,
      )
      vbrEncodings.set(filepath, result)
    }),
  )

  await Promise.all(
    ranges.map(async (range, index) => {
      const effectiveEncoding = vbrEncodings.has(range.filepath)
        ? vbrEncodings.get(range.filepath)
        : options.encoding

      const outputExtension =
        outputContainer(
          effectiveEncoding?.codec,
          MediaType.fromPath(range.filepath),
        )?.extension ?? extname(range.filepath)
      const outputFilename = `${prefix}${(index + 1).toString().padStart(5, "0")}${outputExtension}`
      const outputFilepath = join(output, outputFilename)

      using stack = new DisposableStack()
      stack.defer(() => {
        options.lock.release()
      })
      await options.lock.wait()

      if (options.signal?.aborted) throw new Error("Aborted")

      await timing.timeAsync(
        `${range.filepath},${range.start}:${range.end}`,
        async () => {
          const wasSplit = await splitFile(
            range.filepath,
            outputFilepath,
            range.start,
            range.end,
            effectiveEncoding,
            options.signal,
            options.logger,
          )

          if (wasSplit) {
            outputFiles.push(outputFilename)

            options.onProgress?.((outputFiles.length + 1) / ranges.length)
          }
        },
      )
    }),
  )

  return { processedFiles: outputFiles, timing }
}
