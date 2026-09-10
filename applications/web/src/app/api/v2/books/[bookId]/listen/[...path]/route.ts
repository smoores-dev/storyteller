import { existsSync } from "node:fs"
import { mkdir, readdir, stat } from "node:fs/promises"
import { basename, dirname, extname, join, resolve, sep } from "node:path"

import { after } from "next/server"

import { MediaType } from "@storyteller-platform/media-types"

import { getProcessedAudioFilepath } from "@/assets/paths"
import { getTrackChapters, splitTrack } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { getBook, markFormatMissing } from "@/database/books"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"
import {
  createAudiobookManifest,
  getChapterFilename,
  getChapterIdFromFilename,
  isChapterFilename,
} from "@/utils/audioManifest"
import { streamPartialFile } from "@/utils/streamPartialFile"
import type { UUID } from "@/uuid"

type Params = Promise<{
  bookId: UUID
  path: string[]
}>

export const GET = withHasPermission<Params>("bookRead")(async (
  request,
  context,
) => {
  const { bookId, path } = await context.params

  const book = await getBook(bookId, request.auth.user.id)
  if (!book) {
    return Response.json({ message: "Book not found" }, { status: 404 })
  }

  if (!book.audiobook) {
    return Response.json({ message: "Book has no audiobook" }, { status: 404 })
  }

  const audiobookPath = book.audiobook.filepath

  if (!audiobookPath) {
    return Response.json(
      { message: "Book has no audiobook path" },
      { status: 404 },
    )
  }
  const pathSegments = path

  try {
    // if no path segments, return manifest
    // the go toolkit is not able to create a manifest from a bare audiobook file, so we create one ourselves
    if (pathSegments.length === 0 || pathSegments[0] === "manifest.json") {
      try {
        const manifest = await createAudiobookManifest(
          book.audiobook.filepath,
          {
            bookId,
            title: book.title,
            ...(book.subtitle && { subtitle: book.subtitle }),
            ...(book.description && { description: book.description }),
            ...(book.language && { language: book.language }),
            updatedAt: new Date(book.updatedAt),
          },
        )

        return Response.json(manifest.serialize(), {
          headers: {
            "Content-Type": MediaType.JSON.mime,
            "Cache-Control": "public, max-age=3600",
          },
        })
      } catch (error) {
        logger.error({
          msg: "Failed to create audiobook manifest",
          err: error,
        })

        if (
          error instanceof Error &&
          (error.message.includes("ENOENT") ||
            error.message.includes("no such file"))
        ) {
          after(() => markFormatMissing(bookId, "audiobook"))

          return Response.json(
            {
              error: "book_not_found",
              message:
                "Audiobook file not found on disk. It may have been moved or deleted.",
              bookId,
            },
            {
              status: 404,
              headers: {
                "Cache-Control": "no-cache, no-store, must-revalidate",
              },
            },
          )
        }

        return Response.json(
          {
            error: "internal_error",
            message: "Failed to create audiobook manifest",
          },
          {
            status: 500,
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          },
        )
      }
    }

    const requestedFile = pathSegments.join("/")

    const root = resolve(audiobookPath)
    const original = resolve(root, requestedFile)
    if (!original.startsWith(root + sep)) {
      return Response.json({ message: "File not found" }, { status: 404 })
    }

    let dir: string[]
    try {
      dir = await readdir(audiobookPath)
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("ENOENT") ||
          error.message.includes("no such file"))
      ) {
        after(() => markFormatMissing(bookId, "audiobook"))

        return Response.json(
          {
            error: "book_not_found",
            message:
              "Audiobook directory not found on disk. It may have been moved or deleted.",
            bookId,
          },
          {
            status: 404,
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          },
        )
      }
      throw error
    }

    if (await isFile(original)) {
      return await streamPartialFile(request, original)
    }

    const processed = getProcessedAudioFilepath(book, basename(requestedFile))
    if (await isFile(processed)) {
      return await streamPartialFile(request, processed)
    }

    const m4bFiles = dir.filter((f) => extname(f).toLowerCase() === ".m4b")
    const m4bFile = m4bFiles[0]

    if (
      m4bFiles.length !== 1 ||
      !m4bFile ||
      !isChapterFilename(requestedFile)
    ) {
      return Response.json({ message: "File not found" }, { status: 404 })
    }

    const m4bPath = join(audiobookPath, m4bFile)

    const [chapters, codec, bitrate] = await Promise.all([
      getTrackChapters(m4bPath),
      getSetting("codec"),
      getSetting("bitrate"),
    ])

    const targetChapterIdx = chapters.findIndex(
      (chapter) => chapter.id === getChapterIdFromFilename(requestedFile),
    )
    const targetChapter = chapters[targetChapterIdx]
    if (targetChapterIdx === -1 || !targetChapter) {
      return Response.json({ message: "Chapter not found" }, { status: 404 })
    }

    const transcodePath = getProcessedAudioFilepath(book, requestedFile)

    after(async () => {
      const nextChapter = chapters[targetChapterIdx + 1]
      if (!nextChapter) {
        return
      }

      const chapterFilename = getChapterFilename(
        targetChapterIdx + 1,
        codec ?? "mp3",
      ).filename

      const nextTranscodePath = getProcessedAudioFilepath(book, chapterFilename)
      if (existsSync(nextTranscodePath)) {
        return
      }

      const success = await splitTrack(
        m4bPath,
        nextChapter.startTime,
        nextChapter.endTime,
        nextTranscodePath,
        codec ?? "mp3",
        bitrate ?? null,
      )

      if (!success) {
        logger.error({ msg: "Failed to split track", nextTranscodePath })
      }
    })

    await mkdir(dirname(transcodePath), { recursive: true })

    const success = await splitTrack(
      m4bPath,
      targetChapter.startTime,
      targetChapter.endTime,
      transcodePath,
      codec ?? "mp3",
      bitrate ?? null,
    )

    if (!success) {
      return Response.json(
        { message: "Failed to split track" },
        { status: 500 },
      )
    }

    return await streamPartialFile(request, transcodePath)
  } catch (error) {
    logger.error({ msg: "Error in audiobook listen endpoint:", err: error })
    return Response.json({ message: "Internal server error" }, { status: 500 })
  }
})

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}
