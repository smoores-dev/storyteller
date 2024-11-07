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
  getTrackChapters,
  getTrackDuration,
  splitTrack,
  transcodeTrack,
} from "@/audio"
import { StorytellerTranscription } from "@/synchronize/getSentenceRanges"

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

const COVER_IMAGE_FILE_EXTENSIONS = [".jpeg", ".jpg", ".png"]
const MP3_FILE_EXTENSIONS = [".mp3"]
const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"]
export const AUDIO_FILE_EXTENSIONS = [
  ...MP3_FILE_EXTENSIONS,
  ...MPEG4_FILE_EXTENSIONS,
]

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

export async function processAudioFile(
  filepath: string,
  outDir: string,
  prefix: string,
  codec: string | null,
  bitrate: string | null,
  onProgress?: (progress: number) => void,
): Promise<AudioFile[]> {
  const duration = await getTrackDuration(filepath)
  const chapters = await getTrackChapters(filepath)
  const outputExtension = determineExtension(codec, filepath)
  if (!chapters.length) {
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

  const chapterRanges = chapters.map((chapter, index) => {
    const nextChapterStart = chapters[index + 1]?.startTime ?? duration
    return { start: chapter.startTime, end: nextChapterStart }
  })

  const audioFiles: AudioFile[] = []
  for (let i = 0; i < chapterRanges.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const chapterRange = chapterRanges[i]!
    const chapterFilename = `${prefix}${(i + 1).toString().padStart(5, "0")}${outputExtension}`
    const chapterFilepath = join(outDir, chapterFilename)
    await rm(chapterFilepath, { force: true })

    console.log(`Splitting chapter ${chapterFilepath}`)
    audioFiles.push({
      filename: chapterFilename,
      bare_filename: chapterFilename.slice(0, chapterFilename.length - 4),
      extension: ".mp4",
    })

    await splitTrack(
      filepath,
      chapterRange.start,
      chapterRange.end,
      chapterFilepath,
      codec,
      bitrate,
    )
    onProgress?.((i + 1) / chapterRanges.length)
  }

  return audioFiles
}

export async function processFile(
  bookUuid: UUID,
  filepath: string,
  outDir: string,
  prefix: string,
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
