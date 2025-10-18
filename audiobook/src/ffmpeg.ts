import { exec, execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { cp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { extname } from "@storyteller-platform/path"

const execPromise = promisify(exec)
const execFilePromise = promisify(execFile)

async function execCmd(command: string) {
  let stdout: string = ""
  let stderr: string = ""
  try {
    ;({ stdout, stderr } = await execPromise(command))
    return stdout
  } catch (error) {
    console.error(error)
    console.warn(stdout)
    throw new Error(stderr)
  }
}

async function execCmdBuffer(command: string, args: string[]) {
  try {
    const { stdout } = await execFilePromise(command, args, {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
      cwd: process.cwd(),
    })
    return stdout
  } catch (error) {
    console.error(error)
    if (error && typeof error === "object" && "stdout" in error) {
      console.warn(error.stdout?.toString())
      throw new Error(error.stdout?.toString())
    }
    throw error
  }
}

export function escapeQuotes(input: string) {
  return input.replaceAll(/"/g, '\\"')
}

export function quotePath(path: string) {
  return `"${escapeQuotes(path)}"`
}

type FfprobeStreamOutput =
  | {
      index: string
      codec_name: string
      codec_long_name: string
      r_frame_rate: string
      avg_frame_rate: string
      time_base: string
      start_pts: number
      start_time: string
      duration_ts: number
      duration: string
      bit_rate: string
      disposition: {
        default: 0
        dub: 0
        original: 0
        comment: 0
        lyrics: 0
        karaoke: 0
        forced: 0
        hearing_impaired: 0
        visual_impaired: 0
        clean_effects: 0
        attached_pic: 0
        timed_thumbnails: 0
        non_diegetic: 0
        captions: 0
        descriptions: 0
        still_image: 0
        multilayer: 0
      }
      tags?: {
        encoder: string
      }
    }
  | {
      index: string
      codec_name: "mjpeg" | "jpeg" | "png" | "bmp" | "gif"
      codec_long_name: string
      r_frame_rate: string
      avg_frame_rate: string
      time_base: string
      start_pts: number
      start_time: string
      duration_ts: number
      duration: string
      bit_rate: string
      disposition: {
        default: 0
        dub: 0
        original: 0
        comment: 0
        lyrics: 0
        karaoke: 0
        forced: 0
        hearing_impaired: 0
        visual_impaired: 0
        clean_effects: 0
        attached_pic: 1
        timed_thumbnails: 0
        non_diegetic: 0
        captions: 0
        descriptions: 0
        still_image: 0
        multilayer: 0
      }
      tags?: {
        title: string
        comment: string
      }
    }

type FfprobeOutput = {
  format: {
    tags: {
      title?: string
      Title?: string
      subtitle?: string
      Subtitle?: string
      date?: string
      Date?: string
      album?: string
      Album?: string
      album_artist?: string
      Album_Artist?: string
      artist?: string
      Artist?: string
      performer?: string
      Performer?: string
      composer?: string
      Composer?: string
      comment?: string
      Comment?: string
      description?: string
      Description?: string
      publisher?: string
      Publisher?: string
    }
  }
  duration: string
  bit_rate?: string
  chapters: FfprobeChapterOutput[]
  streams: FfprobeStreamOutput[]
}

type FfprobeChapterOutput = {
  id: number
  time_base: string
  start: number
  start_time: string
  end: number
  end_time: string
  tags: {
    title?: string
  }
}

export type ChapterInfo = {
  id: number
  startTime: number
  endTime: number
  title?: string | undefined
}

export type TrackInfo = Awaited<ReturnType<typeof getTrackMetadata>>

export type AttachedPic = {
  data: Uint8Array
  mimeType: string
  kind: "coverFront" | "coverBack" | "unknown"
  name?: string | undefined
  description?: string | undefined
}

function lookup(codecName: "mjpeg" | "jpeg" | "png" | "bmp" | "gif") {
  switch (codecName) {
    case "mjpeg":
    case "jpeg": {
      return "image/jpeg"
    }
    case "bmp": {
      return "image/bmp"
    }
    case "png": {
      return "image/png"
    }
    case "gif": {
      return "image/gif"
    }
  }
}

export async function getTrackMetadata(path: string) {
  const stdout = await execCmd(
    `ffprobe -i ${quotePath(path)} -v quiet -show_format -show_chapters -show_streams -output_format json`,
  )

  const { chapters, streams, format, duration, bit_rate } = JSON.parse(
    stdout,
  ) as FfprobeOutput
  const attachedPicStream = streams.find(
    (
      stream,
    ): stream is Extract<
      FfprobeStreamOutput,
      { disposition: { attached_pic: 1 } }
    > => !!stream.disposition.attached_pic,
  )
  const attachedPic: AttachedPic | undefined = attachedPicStream && {
    name: attachedPicStream.tags?.title,
    mimeType: lookup(attachedPicStream.codec_name),
    kind: "coverFront",
    description: attachedPicStream.tags?.comment,
    data: await execCmdBuffer("ffmpeg", [
      "-nostdin",
      "-i",
      path,
      "-map",
      "0:v",
      "-c:v",
      "copy",
      "-vframes",
      "1",
      "-f",
      "image2",
      "-update",
      "1",
      "pipe:1",
    ]),
  }

  return {
    duration: parseFloat(duration),
    bitRate: bit_rate !== undefined ? parseFloat(bit_rate) : bit_rate,
    tags: {
      title: format.tags.title ?? format.tags.Title,
      subtitle: format.tags.subtitle ?? format.tags.Subtitle,
      date: format.tags.date ?? format.tags.Date,
      album: format.tags.album ?? format.tags.Album,
      albumArtist: format.tags.album_artist ?? format.tags.Album_Artist,
      artist: format.tags.artist ?? format.tags.Artist,
      performer: format.tags.performer ?? format.tags.Performer,
      composer: format.tags.composer ?? format.tags.Composer,
      comment: format.tags.comment ?? format.tags.Comment,
      description: format.tags.description ?? format.tags.Description,
      publisher: format.tags.publisher ?? format.tags.Publisher,
    },
    chapters: chapters.map(
      (chapter) =>
        ({
          id: chapter.id,
          startTime: parseFloat(chapter.start_time),
          endTime: parseFloat(chapter.end_time),
          title: chapter.tags.title,
        }) satisfies ChapterInfo,
    ),
    attachedPic,
  }
}

export async function writeTrackMetadata(
  path: string,
  metadata: TrackInfo["tags"],
  attachedPic: AttachedPic | undefined,
) {
  const args: string[] = []
  const metadataArgs: string[] = []

  if (metadata.title) {
    metadataArgs.push(`-metadata title="${escapeQuotes(metadata.title)}"`)
  }
  if (metadata.subtitle) {
    metadataArgs.push(`-metadata subtitle="${escapeQuotes(metadata.subtitle)}"`)
  }
  if (metadata.date) {
    metadataArgs.push(`-metadata date="${escapeQuotes(metadata.date)}"`)
  }
  if (metadata.album) {
    metadataArgs.push(`-metadata album="${escapeQuotes(metadata.album)}"`)
  }
  if (metadata.albumArtist) {
    metadataArgs.push(
      `-metadata album_artist="${escapeQuotes(metadata.albumArtist)}"`,
    )
  }
  if (metadata.artist) {
    metadataArgs.push(`-metadata artist="${escapeQuotes(metadata.artist)}"`)
  }
  if (metadata.performer) {
    metadataArgs.push(
      `-metadata performer="${escapeQuotes(metadata.performer)}"`,
    )
  }
  if (metadata.composer) {
    metadataArgs.push(`-metadata composer="${escapeQuotes(metadata.composer)}"`)
  }
  if (metadata.comment) {
    metadataArgs.push(`-metadata comment="${escapeQuotes(metadata.comment)}"`)
  }
  if (metadata.description) {
    metadataArgs.push(
      `-metadata description="${escapeQuotes(metadata.description)}"`,
    )
  }
  if (metadata.publisher) {
    metadataArgs.push(
      `-metadata publisher="${escapeQuotes(metadata.publisher)}"`,
    )
  }

  const ext = extname(path)
  const tmpPath = join(
    tmpdir(),
    `storyteller-platform-audiobook-${randomUUID()}${ext}`,
  )
  let picPath: string | null = null

  try {
    if (attachedPic) {
      // Determine file extension from mime type
      const imageExt = attachedPic.mimeType.split("/")[1]
      picPath = join(
        tmpdir(),
        `storyteller-platform-audiobook-${randomUUID()}.${imageExt}`,
      )

      // Write cover art to temporary file
      await writeFile(picPath, attachedPic.data)

      args.push(`-i ${quotePath(picPath)}`)
      args.push(`-map 0:a -map 1:v`)
      args.push(`-disposition:v:0 attached_pic`)
      if (attachedPic.name) {
        metadataArgs.push(
          `-metadata:s:v title="${escapeQuotes(attachedPic.name)}"`,
        )
      }
      if (attachedPic.kind !== "unknown") {
        metadataArgs.push(
          `-metadata:s:v comment="${attachedPic.kind === "coverFront" ? "Cover (front)" : "Cover (back)"}"`,
        )
      }
    }

    args.push(...metadataArgs)

    const cmd = `ffmpeg -i ${quotePath(path)} ${args.join(" ")} -codec copy "${tmpPath}"`

    await execCmd(cmd)
    await cp(tmpPath, path, { force: true })
  } finally {
    try {
      await rm(tmpPath)
    } catch (error) {
      // Ignore cleanup errors
      console.warn(`Failed to clean up temporary file ${tmpPath}:`, error)
    }
    if (picPath) {
      try {
        await rm(picPath)
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Failed to clean up temporary file ${picPath}:`, error)
      }
    }
  }
}

export async function getTrackMetadataFromBuffer(buffer: Uint8Array) {
  const tempFile = join(tmpdir(), `ffprobe-${randomUUID()}`)

  try {
    writeFileSync(tempFile, buffer)

    const result = await getTrackMetadata(tempFile)

    return result
  } finally {
    try {
      await rm(tempFile)
    } catch (error) {
      // Ignore cleanup errors
      console.warn(`Failed to clean up temporary file ${tempFile}:`, error)
    }
  }
}
