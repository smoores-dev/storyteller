import { exec } from "node:child_process"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execPromise = promisify(exec)

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

export function quotePath(path: string) {
  return `"${path.replaceAll(/"/g, '\\"')}"`
}

type FfmpegChapters = {
  chapters: FfmpegChapterInfo[]
}

type FfmpegChapterInfo = {
  id: number
  time_base: string
  start: number
  start_time: string
  end: number
  end_time: string
  tags: {
    title: string
  }
}

export type ChapterInfo = {
  id: number
  startTime: number
  endTime: number
  title: string
}

function parseChapterInfo(ffmpegChapterInfo: FfmpegChapterInfo): ChapterInfo {
  return {
    id: ffmpegChapterInfo.id,
    startTime: parseFloat(ffmpegChapterInfo.start_time),
    endTime: parseFloat(ffmpegChapterInfo.end_time),
    title: ffmpegChapterInfo.tags.title,
  }
}

export async function getTrackChapters(path: string) {
  const stdout = await execCmd(
    `ffprobe -i ${quotePath(path)} -show_chapters -of json`,
  )

  const { chapters } = JSON.parse(stdout) as FfmpegChapters
  return chapters.map((chapter) => parseChapterInfo(chapter))
}

export async function getTrackChaptersFromBuffer(buffer: Uint8Array) {
  const tempFile = join(tmpdir(), `ffprobe-${randomUUID()}`)

  try {
    writeFileSync(tempFile, buffer)

    const result = await getTrackChapters(tempFile)

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
