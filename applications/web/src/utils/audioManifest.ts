import { existsSync } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { basename, extname, join } from "node:path"

import {
  Contributor,
  Contributors,
  Link,
  Links,
  LocalizedString,
  Manifest,
  Metadata,
} from "@readium/shared"

import { Audiobook, outputContainer } from "@storyteller-platform/audiobook"
import { MediaType } from "@storyteller-platform/media-types"

import { getMetadataFromAudiobook } from "@/assets/metadata"
import {
  getTrackChapters,
  getTrackInfo,
  isAudioFile,
  lookupAudioMime,
} from "@/audio"
import { getSetting } from "@/database/settings"
import { getCoverUrl } from "@/store/api"
import type { UUID } from "@/uuid"

export interface AudioFileInfo {
  filename: string
  filepath: string
  size: number
  duration?: number
  mimeType: string
}

export interface ManifestOptions {
  bookId: UUID
  updatedAt: Date
  title: string
  subtitle?: string
  description?: string
  language?: string
  baseUrl?: string
}

/**
 * get audio file information including metadata
 */
export async function getAudioFileInfo(
  filepath: string,
): Promise<AudioFileInfo> {
  const stats = await stat(filepath)
  const filename = basename(filepath)
  const mimeType = lookupAudioMime(filepath) || MediaType.MPEG_AUDIO.mime

  return {
    filename,
    filepath,
    size: stats.size,
    mimeType,
  }
}

/**
 * scan directory for audio files and return sorted list
 */
export async function getDirectoryAudioFiles(
  dirPath: string,
): Promise<AudioFileInfo[]> {
  if (!existsSync(dirPath)) {
    return []
  }

  const files = await readdir(dirPath)
  const audioFiles: AudioFileInfo[] = []

  for (const file of files) {
    const filepath = join(dirPath, file)

    if (isAudioFile(file)) {
      const fileInfo = await getAudioFileInfo(filepath)
      audioFiles.push(fileInfo)
    }
  }

  return audioFiles.sort((a, b) => a.filename.localeCompare(b.filename))
}

/**
 * create chapter filename for m4b chapters
 */
export function getChapterFilename(idx: number, codec: string | null) {
  const baseFilename = `${idx.toString().padStart(5, "0")}-${"1".padStart(5, "0")}`
  const outputExtension =
    outputContainer(codec, MediaType.MP4_AUDIO)?.extension ?? ".mp4"

  return {
    filename: `${baseFilename}${outputExtension}`,
    bare_filename: baseFilename,
    extension: outputExtension,
  }
}

/**
 * extract chapter id from chapter filename
 */
export function getChapterIdFromFilename(filename: string): number {
  const [id] = filename.split("-")
  return parseInt(id ?? "0", 10)
}

/**
 * create readium manifest for m4b audiobook file
 */
export async function createM4bManifest(
  m4bPath: string,
  options: ManifestOptions,
): Promise<Manifest> {
  using audiobook = await Audiobook.from(m4bPath)

  const [codec, metadata, chapters] = await Promise.all([
    getSetting("codec"),
    getMetadataFromAudiobook(audiobook),
    getTrackChapters(m4bPath),
  ])

  const links = new Links(
    chapters.map((chapter, idx) => {
      const filename = getChapterFilename(idx, codec ?? "mp3").filename
      const mimetype = lookupAudioMime(filename) ?? MediaType.OCTET_STREAM.mime
      return new Link({
        rels: new Set(["chapter"]),
        href: filename,
        type: mimetype,
        duration: chapter.endTime - chapter.startTime,
        title: chapter.title || `Track ${idx + 1}`,
      })
    }),
  )

  const subtitle = metadata.update?.subtitle ?? options.subtitle

  return new Manifest({
    metadata: new Metadata({
      title: new LocalizedString(metadata.update?.title ?? options.title),
      subtitle: new LocalizedString(subtitle ?? ""),
      description: metadata.update?.description ?? options.description ?? "",
      languages: options.language ? [options.language] : [],
      authors: new Contributors(
        metadata.relations.creators
          ?.filter((author) => author.role === "aut")
          .map(
            (author) =>
              new Contributor({ name: new LocalizedString(author.name) }),
          ) ?? [],
      ),
      narrators: new Contributors(
        metadata.relations.creators
          ?.filter((narrator) => narrator.role === "nrt")
          .map(
            (narrator) =>
              new Contributor({
                name: new LocalizedString(narrator.name),
              }),
          ) ?? [],
      ),
    }),
    links: new Links([
      new Link({
        rels: new Set(["self"]),
        href: `manifest.json`,
        type: MediaType.AUDIOBOOK_MANIFEST.mime,
      }),
      new Link({
        rels: new Set(["cover"]),
        href: getCoverUrl(options.bookId, {
          height: 1024,
          width: 1024,
          audio: true,
          updatedAt: new Date(),
        }),
        type: MediaType.JPEG.mime,
      }),
      new Link({
        rels: new Set(["alternate"]),
        href: `m4b`,
        type: MediaType.MP4_AUDIO.mime,
      }),
    ]),
    readingOrder: links,
    resources: links,
    toc: links,
  })
}

/**
 * create readium manifest for directory of audio files
 */
export async function createDirectoryManifest(
  dirPath: string,
  options: ManifestOptions,
): Promise<Manifest> {
  const audioFiles = await getDirectoryAudioFiles(dirPath)

  if (audioFiles.length === 0) {
    throw new Error("No audio files found in directory")
  }

  // gotta get that track info
  const tracks = await Promise.all(
    audioFiles.map(async (file) => {
      const track = await getTrackInfo(file.filepath)
      return { ...file, ...track, href: file.filename }
    }),
  )

  const links = new Links(
    tracks.map((file, idx) => {
      return new Link({
        rels: new Set(["chapter"]),
        href: file.href,
        type: file.mimeType,
        title: `Track ${file.tags?.track ?? idx + 1}`,
        duration: file.duration,
        size: file.size,
        bitrate: file.bitRate,
      })
    }),
  )

  return new Manifest({
    metadata: new Metadata({
      title: new LocalizedString(options.title),
      subtitle: new LocalizedString(options.subtitle ?? ""),
      description: options.description ?? "",
      languages: options.language ? [options.language] : [],
      authors: new Contributors([]),
      narrators: new Contributors([]),
    }),
    links: new Links([
      new Link({
        rels: new Set(["self"]),
        href: `manifest.json`,
        type: MediaType.AUDIOBOOK_MANIFEST.mime,
      }),
      new Link({
        rels: new Set(["cover"]),
        href: getCoverUrl(options.bookId, {
          height: 1024,
          width: 1024,
          audio: true,
          updatedAt: options.updatedAt,
        }),
        type: MediaType.JPEG.mime,
      }),
    ]),
    readingOrder: links,
    resources: links,
    toc: links,
  })
}

/**
 * create readium manifest for audiobook directory
 * automatically detects whether it's a single m4b or directory of files
 */
export async function createAudiobookManifest(
  audiobookPath: string,
  options: ManifestOptions,
): Promise<Manifest> {
  const dir = await readdir(audiobookPath)

  // check for single m4b file
  const m4bFiles = dir.filter((f) => extname(f).toLowerCase() === ".m4b")

  if (m4bFiles.length === 1) {
    const m4bFile = m4bFiles[0]
    if (!m4bFile) {
      throw new Error("M4B file not found")
    }
    const m4bPath = join(audiobookPath, m4bFile)
    return createM4bManifest(m4bPath, options)
  }

  // fallback to directory-based manifest
  return createDirectoryManifest(audiobookPath, options)
}
