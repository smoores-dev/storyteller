import { AUDIO_DIR } from "@/directories"
import { UUID } from "@/uuid"
import { extension } from "mime-types"
import { parseFile, selectCover } from "music-metadata"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { tmpdir } from "node:os"
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"
import {
  AUDIO_FILE_EXTENSIONS,
  COVER_IMAGE_FILE_EXTENSIONS,
  getTrackChapters,
  getTrackDuration,
  MP3_FILE_EXTENSIONS,
  MPEG4_FILE_EXTENSIONS,
  splitTrack,
  transcodeTrack,
} from "@/audio"
import { StorytellerTranscription } from "@/synchronize/getSentenceRanges"
import { detectVoiceActivity } from "echogarden/dist/api/VoiceActivityDetection"
import { streamFile } from "@/fs"

export function getAudioDirectory(bookUuid: UUID) {
  return join(AUDIO_DIR, bookUuid)
}

export function getAudioIndexPath(bookUuid: UUID) {
  return join(getAudioDirectory(bookUuid), "index.json")
}

export type AudioFile = {
  filename: string
  bare_filename: string
  extension: string
}

export type AudioIndex = {
  cover?: string
  processed_files?: AudioFile[]
}

export async function getAudioIndex(
  bookUuid: UUID,
): Promise<null | AudioIndex> {
  const path = getAudioIndexPath(bookUuid)

  try {
    const indexFile = await readFile(path, {
      encoding: "utf-8",
    })
    return JSON.parse(indexFile) as AudioIndex
  } catch {
    return null
  }
}

export function getOriginalAudioFilepath(bookUuid: UUID, filename = "") {
  return join(getAudioDirectory(bookUuid), "original", filename)
}

export function getProcessedAudioFilepath(bookUuid: UUID, filename = "") {
  return join(getAudioDirectory(bookUuid), "processed", filename)
}

export async function getAudioCoverFilepath(bookUuid: UUID) {
  const index = await getAudioIndex(bookUuid)
  if (index === null) return index

  if (!("cover" in index)) return null

  return join(getAudioDirectory(bookUuid), index.cover)
}

export async function getProcessedFiles(bookUuid: UUID) {
  const index = await getAudioIndex(bookUuid)
  return index?.processed_files?.sort(({ filename: a }, { filename: b }) => {
    if (a < b) return -1
    if (b > a) return 1
    return 0
  })
}

export function getTranscriptionsFilepath(bookUuid: UUID, filename = "") {
  return join(getAudioDirectory(bookUuid), "transcriptions", filename)
}

export async function persistCover(bookUuid: UUID, coverFilename: string) {
  const index = (await getAudioIndex(bookUuid)) ?? {}
  index.cover = coverFilename

  await writeFile(getAudioIndexPath(bookUuid), JSON.stringify(index), {
    encoding: "utf-8",
  })
}

export async function persistCustomCover(
  bookUuid: UUID,
  filename: string,
  cover: Uint8Array,
) {
  const coverFilepath = join(getAudioDirectory(bookUuid), filename)
  await writeFile(coverFilepath, cover)
  await persistCover(bookUuid, filename)
}

export async function extractCover(bookUuid: UUID, trackPath: string) {
  const { common } = await parseFile(trackPath)
  const coverImage = selectCover(common.picture)
  if (!coverImage) return

  const ext = extension(coverImage.format)
  if (!ext)
    console.error(
      `Failed to extract cover image; unknown mime type ${coverImage.format}`,
    )

  const coverFilename = `Audio Cover.${ext}`
  await persistCustomCover(bookUuid, coverFilename, coverImage.data)
}

function determineExtension(codec: string | null, inputFilename: string) {
  if (codec === "libopus") {
    return ".mp4"
  }
  if (codec === "libmp3lame") {
    return ".mp3"
  }
  if (codec === "aac") {
    return ".mp4"
  }
  const inputExtension = extname(inputFilename)
  if (MP3_FILE_EXTENSIONS.includes(inputExtension)) {
    return ".mp3"
  }
  if (MPEG4_FILE_EXTENSIONS.includes(inputExtension)) {
    return ".mp4"
  }
  return inputExtension
}

export async function getSafeRanges(
  filepath: string,
  duration: number,
  maxLength: number | null,
) {
  console.log(
    "Audio track is longer than two hours; using VAD to determine safe split points",
  )
  const audio = await streamFile(filepath)
  const vadTimeline = await detectVoiceActivity(audio, {
    engine: "adaptive-gate",
  })
  const silenceTimeline = vadTimeline.timeline.reduce<
    { start: number; end: number }[]
  >((acc, entry) => {
    const lastEntry = acc[acc.length - 1]
    if (!lastEntry) {
      acc.push({ start: entry.endTime, end: entry.endTime })
      return acc
    }
    lastEntry.end = entry.startTime
    acc.push({ start: entry.endTime, end: entry.endTime })
    return acc
  }, [])
  const ranges: { start: number; end: number }[] = [{ start: 0, end: duration }]
  for (let i = 0; i + 1 < duration / (60 * 60 * (maxLength ?? 2)); i++) {
    const candidates = silenceTimeline.filter(
      (entry) =>
        entry.start > 60 * 60 * (maxLength ?? 2) * (i + 1) - 60 &&
        entry.end < 60 * 60 * (maxLength ?? 2) * (i + 1) + 60,
    )
    const nearestLikelySentenceBreak = candidates.reduce((acc, entry) => {
      const currLength = acc.end - acc.start
      const entryLength = entry.end - entry.start
      return currLength > entryLength ? acc : entry
    })
    // We initialize this with one element, so there's always at least
    // one element in it
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastRange = ranges[ranges.length - 1]!
    lastRange.end = nearestLikelySentenceBreak.start
    ranges.push({ start: nearestLikelySentenceBreak.end, end: duration })
  }
  return ranges
}

export async function processAudioFile(
  filepath: string,
  outDir: string,
  prefix: string,
  maxLength: number | null,
  codec: string | null,
  bitrate: string | null,
  onProgress?: (progress: number) => void,
): Promise<AudioFile[]> {
  const duration = await getTrackDuration(filepath)
  const chapters = await getTrackChapters(filepath)
  const outputExtension = determineExtension(codec, filepath)
  if (!chapters.length && duration < 60 * 60 * (maxLength ?? 2)) {
    const destination = join(outDir, `${prefix}00001${outputExtension}`)
    await transcodeTrack(filepath, destination, codec, bitrate)
    return [
      {
        filename: `${prefix}00001${outputExtension}`,
        bare_filename: `${prefix}00001`,
        extension: outputExtension,
      },
    ]
  }

  const chapterRanges = chapters.length
    ? chapters.map((chapter, index) => {
        const nextChapterStart = chapters[index + 1]?.startTime ?? duration
        return { start: chapter.startTime, end: nextChapterStart }
      })
    : await getSafeRanges(filepath, duration, maxLength)

  const audioFiles: AudioFile[] = []
  for (let i = 0; i < chapterRanges.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const chapterRange = chapterRanges[i]!
    const chapterFilename = `${prefix}${(i + 1).toString().padStart(5, "0")}${outputExtension}`
    const chapterFilepath = join(outDir, chapterFilename)
    await rm(chapterFilepath, { force: true })

    console.log(`Splitting chapter ${chapterFilepath}`)

    if (
      await splitTrack(
        filepath,
        chapterRange.start,
        chapterRange.end,
        chapterFilepath,
        codec,
        bitrate,
      )
    ) {
      audioFiles.push({
        filename: chapterFilename,
        bare_filename: chapterFilename.slice(0, chapterFilename.length - 4),
        extension: outputExtension,
      })
    }

    onProgress?.((i + 1) / chapterRanges.length)
  }

  return audioFiles
}

export async function processFile(
  bookUuid: UUID,
  filepath: string,
  outDir: string,
  prefix: string,
  maxLength: number | null,
  codec: string | null,
  bitrate: string | null,
  onProgress?: (progress: number) => void,
) {
  const audioFiles: AudioFile[] = []

  const filename = basename(filepath)
  const ext = extname(filename)
  const bareFilename = basename(filename, ext)

  if (
    COVER_IMAGE_FILE_EXTENSIONS.includes(ext) &&
    bareFilename.toLowerCase() === "cover"
  ) {
    const coverFilepath = join(getAudioDirectory(bookUuid), filename)
    await copyFile(filepath, coverFilepath)
    await persistCover(bookUuid, filename)
  }

  if (AUDIO_FILE_EXTENSIONS.includes(ext)) {
    if ((await getAudioCoverFilepath(bookUuid)) === null) {
      await extractCover(bookUuid, filepath)
    }
    const processed = await processAudioFile(
      filepath,
      outDir,
      prefix,
      maxLength,
      codec,
      bitrate,
      onProgress,
    )
    audioFiles.push(...processed)
  }

  if (ext === ".zip") {
    const tempDir = await mkdtemp(join(tmpdir(), bareFilename))
    const zipContents = await readFile(filepath)
    const dataReader = new Uint8ArrayReader(new Uint8Array(zipContents.buffer))
    const zipReader = new ZipReader(dataReader)
    try {
      const entries = await zipReader.getEntries()
      for (let i = 0; i < entries.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const entry = entries[i]!
        if (entry.directory) continue

        const zext = extname(entry.filename)
        if (
          MP3_FILE_EXTENSIONS.includes(zext) ||
          MPEG4_FILE_EXTENSIONS.includes(zext)
        ) {
          const tempFilepath = join(tempDir, entry.filename)
          await writeFile(
            tempFilepath,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await entry.getData!(new Uint8ArrayWriter()),
          )
          const processed = await processFile(
            bookUuid,
            tempFilepath,
            outDir,
            `${prefix}${i.toString().padStart(5, "0")}-`,
            maxLength,
            codec,
            bitrate,
            (progress: number) =>
              onProgress?.(
                i / entries.length + progress * (1 / entries.length),
              ),
          )
          audioFiles.push(...processed)
        }
      }
    } finally {
      await zipReader.close()
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  return audioFiles
}

export async function persistProcessedFilesList(
  bookUuid: UUID,
  audioFiles: AudioFile[],
) {
  const index = (await getAudioIndex(bookUuid)) ?? {}
  index.processed_files = audioFiles

  await writeFile(getAudioIndexPath(bookUuid), JSON.stringify(index), {
    encoding: "utf-8",
  })
}

export async function processAudiobook(
  bookUuid: UUID,
  maxLength: number | null,
  codec: string | null,
  bitrate: string | null,
  onProgress?: (progress: number) => void,
) {
  const originalAudioDirectory = getOriginalAudioFilepath(bookUuid)
  const processedAudioDirectory = getProcessedAudioFilepath(bookUuid)

  await mkdir(processedAudioDirectory, { recursive: true })

  const filenames = await readdir(originalAudioDirectory)

  const processedFilenames = await readdir(processedAudioDirectory)
  if (processedFilenames.length) return

  const audioFiles: AudioFile[] = []

  for (let i = 0; i < filenames.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const filename = filenames[i]!
    const filepath = getOriginalAudioFilepath(bookUuid, filename)

    const processed = await processFile(
      bookUuid,
      filepath,
      processedAudioDirectory,
      `${i.toString().padStart(5, "0")}-`,
      maxLength,
      codec,
      bitrate,
      (progress: number) =>
        onProgress?.(i / filenames.length + progress * (1 / filenames.length)),
    )
    audioFiles.push(...processed)
  }

  await persistProcessedFilesList(bookUuid, audioFiles)
  return audioFiles
}

export function getTranscriptionFilename(audoFile: AudioFile) {
  return `${audoFile.bare_filename}.json`
}

export async function getTranscriptions(bookUuid: UUID) {
  const audioFiles = await getProcessedFiles(bookUuid)
  if (!audioFiles)
    throw new Error(
      "Could not retrieve transcriptions: found no processed audio files",
    )
  const transcriptionFilepaths = audioFiles.map((audioFile) =>
    getTranscriptionsFilepath(bookUuid, getTranscriptionFilename(audioFile)),
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
