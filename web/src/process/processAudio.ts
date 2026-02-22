import { randomUUID } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join } from "node:path"

import { type AsyncSemaphore } from "@esfx/async-semaphore"
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"

import { streamFile } from "@storyteller-platform/fs"
import { detectVoiceActivity } from "@storyteller-platform/ghost-story/vad"

import { type AudioFile } from "@/assets/covers"
import { getProcessedAudioFiles } from "@/assets/fs"
import {
  getProcessedAudioFilepath,
  getTranscriptionFilename,
  getTranscriptionsFilepath,
} from "@/assets/paths"
import {
  COVER_IMAGE_FILE_EXTENSIONS,
  getTrackChapters,
  getTrackDuration,
  isAudioFile,
  splitTrack,
  transcodeTrack,
} from "@/audio"
import { type Book, type BookWithRelations } from "@/database/books"
import { logger } from "@/logging"
import { type StorytellerTranscription } from "@/synchronize/getSentenceRanges"
import { determineExtension } from "@/utils/audioManifest"

export async function getSafeRanges(
  filepath: string,
  duration: number,
  maxLength: number,
  start: number = 0,
) {
  logger.info(
    `Audio track is longer than ${maxLength} hours; using VAD to determine safe split points`,
  )
  const filename = basename(filepath)
  const ext = extname(filename)
  const rawFilename = filename.replace(ext, "")
  const tmpDir = join(tmpdir(), `storyteller-silence-${randomUUID()}`)

  const maxSeconds = 60 * 60 * maxLength
  const ranges: { start: number; end: number }[] = [
    { start: start, end: duration + start },
  ]
  for (let i = 0; i + 1 < duration / maxSeconds; i++) {
    const tmpFilepath = join(tmpDir, i.toString(), `${rawFilename}.wav`)
    await mkdir(dirname(tmpFilepath), { recursive: true })
    const approxCutPoint = start + maxSeconds * (i + 1)
    const searchStart = approxCutPoint - 120
    const searchEnd = approxCutPoint
    await splitTrack(filepath, searchStart, searchEnd, tmpFilepath, null, null)
    const vadTimeline = await detectVoiceActivity(tmpFilepath, {
      engine: "active-gate-og",
    })

    // It's possible for ffmpeg to guess the duration
    // incorrectly, resulting in empty search files.
    // This happens at the very end, so we just bail out
    // if we encounter this.
    if (vadTimeline.length === 0) {
      break
    }

    const silenceTimeline = vadTimeline.reduce<
      { start: number; end: number }[]
    >((acc, entry) => {
      const lastEntry = acc[acc.length - 1]
      if (!lastEntry) {
        acc.push({
          start: entry.endTime + searchStart,
          end: entry.endTime + searchStart,
        })
        return acc
      }
      lastEntry.end = entry.startTime + searchStart
      acc.push({
        start: entry.endTime + searchStart,
        end: entry.endTime + searchStart,
      })
      return acc
    }, [])

    const nearestLikelySentenceBreak = silenceTimeline.reduce((acc, entry) => {
      const currLength = acc.end - acc.start
      const entryLength = entry.end - entry.start
      return currLength > entryLength ? acc : entry
    })

    // We initialize this with one element, so there's always at least
    // one element in it
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRange = ranges[ranges.length - 1]!
    lastRange.end = nearestLikelySentenceBreak.start
    ranges.push({
      start: nearestLikelySentenceBreak.end,
      end: duration + start,
    })
    await rm(dirname(tmpFilepath), { recursive: true, force: true })
  }
  return ranges
}

export function getChapterFilename(
  prefix: string,
  index: number,
  extension: string,
) {
  const bareFilename = `${prefix}${(index + 1).toString().padStart(5, "0")}`
  return {
    filename: `${bareFilename}${extension}`,
    bare_filename: bareFilename,
    extension,
  }
}

export async function processAudioFile(
  filepath: string,
  outDir: string,
  prefix: string,
  maxLength: number | null,
  codec: string | null,
  bitrate: string | null,
  semaphore: AsyncSemaphore,
  onProgress?: (progress: number) => void,
): Promise<AudioFile[]> {
  const maxHours = maxLength ?? 2
  const maxSeconds = 60 * 60 * maxHours
  const duration = await getTrackDuration(filepath)
  const chapters = await getTrackChapters(filepath)
  const outputExtension = determineExtension(codec, filepath)
  if (!chapters.length && duration <= maxSeconds) {
    const destination = join(outDir, `${prefix}00001${outputExtension}`)
    await semaphore.wait()
    try {
      logger.info(`Transcoding track ${destination}`)
      await transcodeTrack(filepath, destination, codec, bitrate)
    } finally {
      semaphore.release()
    }
    return [
      {
        filename: `${prefix}00001${outputExtension}`,
        bare_filename: `${prefix}00001`,
        extension: outputExtension,
      },
    ]
  }

  const chapterRanges: {
    start: number
    end: number
  }[] = []

  if (chapters.length) {
    const initialRanges = chapters.map((chapter, index) => {
      const nextChapterStart = chapters[index + 1]?.startTime ?? duration
      return { start: chapter.startTime, end: nextChapterStart }
    })

    for (const range of initialRanges) {
      const chapterDuration = range.end - range.start
      if (chapterDuration <= maxSeconds) {
        chapterRanges.push(range)
        continue
      }
      chapterRanges.push(
        ...(await getSafeRanges(
          filepath,
          chapterDuration,
          maxHours,
          range.start,
        )),
      )
    }
  } else {
    chapterRanges.push(...(await getSafeRanges(filepath, duration, maxHours)))
  }

  const audioFiles: AudioFile[] = []
  await Promise.all(
    chapterRanges.map(async (chapterRange, index) => {
      const chapterFilename = getChapterFilename(prefix, index, outputExtension)

      const chapterFilepath = join(outDir, chapterFilename.filename)
      await semaphore.wait()
      try {
        await rm(chapterFilepath, { force: true })

        logger.info(`Splitting chapter ${chapterFilepath}`)

        const wasSplit = await splitTrack(
          filepath,
          chapterRange.start,
          chapterRange.end,
          chapterFilepath,
          codec,
          bitrate,
        )
        if (wasSplit) {
          audioFiles.push(chapterFilename)
        }
      } finally {
        semaphore.release()
      }

      onProgress?.((audioFiles.length + 1) / chapterRanges.length)
    }),
  )

  return audioFiles
}

export async function processFile(
  book: Book,
  filepath: string,
  outDir: string,
  prefix: string,
  maxLength: number | null,
  codec: string | null,
  bitrate: string | null,
  semaphore: AsyncSemaphore,
  onProgress?: (progress: number) => void,
) {
  const audioFiles: AudioFile[] = []

  const filename = basename(filepath)
  const ext = extname(filename)
  const bareFilename = basename(filename, ext)

  if (isAudioFile(ext)) {
    const processed = await processAudioFile(
      filepath,
      outDir,
      prefix,
      maxLength,
      codec,
      bitrate,
      semaphore,
      onProgress,
    )
    audioFiles.push(...processed)
  }

  if (ext === ".zip") {
    const tempDir = await mkdtemp(join(tmpdir(), bareFilename))
    const zipContents = await streamFile(filepath)
    const dataReader = new Uint8ArrayReader(new Uint8Array(zipContents.buffer))
    const zipReader = new ZipReader(dataReader)
    try {
      const entries = await zipReader.getEntries()
      await Promise.all(
        entries.map(async (entry, index) => {
          if (entry.directory) return

          const zext = extname(entry.filename)
          if (isAudioFile(zext) || COVER_IMAGE_FILE_EXTENSIONS.includes(zext)) {
            const tempFilepath = join(tempDir, entry.filename)
            const tempDirname = dirname(tempFilepath)
            await mkdir(tempDirname, { recursive: true })
            await writeFile(
              tempFilepath,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              await entry.getData!(new Uint8ArrayWriter()),
            )
            const processed = await processFile(
              book,
              tempFilepath,
              outDir,
              `${prefix}${index.toString().padStart(5, "0")}-`,
              maxLength,
              codec,
              bitrate,
              semaphore,
              (progress: number) =>
                onProgress?.(
                  audioFiles.length / entries.length +
                    progress * (1 / entries.length),
                ),
            )
            audioFiles.push(...processed)
          }
        }),
      )
    } finally {
      await zipReader.close()
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  return audioFiles
}

export async function processAudiobook(
  book: BookWithRelations,
  maxLength: number | null,
  codec: string | null,
  bitrate: string | null,
  semaphore: AsyncSemaphore,
  onProgress?: (progress: number) => void,
) {
  const originalAudioDirectory = book.audiobook?.filepath
  if (!originalAudioDirectory)
    throw new Error(`No audiobook associated with book ${book.uuid}`)

  const processedAudioDirectory = getProcessedAudioFilepath(book)

  await mkdir(processedAudioDirectory, { recursive: true })

  const filenames = await readdir(originalAudioDirectory, { recursive: true })

  const processedFilenames = await getProcessedAudioFiles(book)
  if (processedFilenames.length) return

  const audioFiles: AudioFile[] = []

  await Promise.all(
    filenames.map(async (filename, index) => {
      const filepath = join(originalAudioDirectory, filename)

      const processed = await processFile(
        book,
        filepath,
        processedAudioDirectory,
        `${index.toString().padStart(5, "0")}-`,
        maxLength,
        codec,
        bitrate,
        semaphore,
        (progress: number) =>
          onProgress?.(
            audioFiles.length / filenames.length +
              progress * (1 / filenames.length),
          ),
      )
      audioFiles.push(...processed)
    }),
  )

  return audioFiles
}

export async function getTranscriptions(book: Book) {
  const audioFiles = await getProcessedAudioFiles(book)
  if (!audioFiles.length)
    throw new Error(
      "Could not retrieve transcriptions: found no processed audio files",
    )
  const transcriptionFilepaths = await Promise.all(
    audioFiles.map((audioFile) =>
      getTranscriptionsFilepath(book, getTranscriptionFilename(audioFile)),
    ),
  )

  const transcriptions = await Promise.all(
    transcriptionFilepaths.map(async (filepath) => {
      const transcriptionContents = await readFile(filepath, {
        encoding: "utf-8",
      })
      return JSON.parse(transcriptionContents) as StorytellerTranscription
    }),
  )
  return transcriptions
}
