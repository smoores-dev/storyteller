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
  stat,
  writeFile,
} from "node:fs/promises"
import { basename, extname, join } from "node:path"
import { tmpdir } from "node:os"
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"
import { getTrackChapters, getTrackDuration, splitTrack } from "@/audio"
import { TranscriptionResult } from "@/transcribe"

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
    await stat(path)
  } catch (_) {
    return null
  }

  const indexFile = await readFile(path, {
    encoding: "utf-8",
  })
  return JSON.parse(indexFile)
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
const PLAIN_AUDIO_FILE_EXTENSIONS = [".mp3"]
const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"]

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
  persistCustomCover(bookUuid, coverFilename, coverImage.data)
}

export async function processMpeg4File(
  filepath: string,
  outDir: string,
  onProgress?: (progress: number) => void,
): Promise<AudioFile[]> {
  const duration = await getTrackDuration(filepath)
  const chapters = await getTrackChapters(filepath)
  if (!chapters.length) {
    const destination = join(outDir, "00001.mp4")
    await copyFile(filepath, destination)
    return [
      { filename: "00001.mp4", bare_filename: "00001", extension: ".mp4" },
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
    const chapterFilename = `${(i + 1).toString().padStart(5, "0")}.mp4`
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
    )
    onProgress?.((i + 1) / chapterRanges.length)
  }

  return audioFiles
}

export async function processFile(
  bookUuid: UUID,
  filepath: string,
  outDir: string,
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

  if (PLAIN_AUDIO_FILE_EXTENSIONS.includes(ext)) {
    if ((await getAudioCoverFilepath(bookUuid)) === null) {
      await extractCover(bookUuid, filepath)
    }
    audioFiles.push({
      filename,
      bare_filename: bareFilename,
      extension: ext,
    })
    await copyFile(filepath, join(outDir, filename))
  }

  if (MPEG4_FILE_EXTENSIONS.includes(ext)) {
    if ((await getAudioCoverFilepath(bookUuid)) === null) {
      await extractCover(bookUuid, filepath)
    }
    const processed = await processMpeg4File(filepath, outDir, onProgress)
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
          PLAIN_AUDIO_FILE_EXTENSIONS.includes(zext) ||
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
            (progress: number) =>
              onProgress?.(i / entries.length + progress + 1 / entries.length),
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
      (progress: number) =>
        onProgress?.(i / filenames.length + progress + 1 / filenames.length),
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
      return JSON.parse(transcriptionContents) as TranscriptionResult
    }),
  )
  return transcriptions
}
