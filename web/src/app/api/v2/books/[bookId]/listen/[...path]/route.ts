import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { type FileHandle, mkdir, open, readdir } from "node:fs/promises"
import { dirname, extname, join } from "node:path"

import { createReadableStreamFromReadable } from "@remix-run/node"
import { lookup } from "mime-types"
import { type NextRequest, after } from "next/server"

import { getProcessedAudioFilepath } from "@/assets/paths"
import { getTrackChapters, splitTrack } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { getBook } from "@/database/books"
import { getSetting } from "@/database/settings"
import { logger } from "@/logging"
import {
  createAudiobookManifest,
  getChapterFilename,
  getChapterIdFromFilename,
} from "@/utils/audioManifest"
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
          },
        )

        return Response.json(manifest.serialize(), {
          headers: {
            "Content-Type": "application/json",
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

    // handle file requests
    const requestedFile = pathSegments.join("/")

    let dir: string[]
    try {
      dir = await readdir(audiobookPath)
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("ENOENT") ||
          error.message.includes("no such file"))
      ) {
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
    const m4bFiles = dir.filter((f) => extname(f).toLowerCase() === ".m4b")

    if (m4bFiles.length === 1) {
      // handle M4B file extraction
      const m4bFile = m4bFiles[0]
      if (!m4bFile) {
        return Response.json({ message: "M4B file not found" }, { status: 404 })
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

      // already split the next track so we don't have to wait as long
      after(async () => {
        if (targetChapterIdx + 1 > chapters.length) {
          return
        }

        const nextChapter = chapters[targetChapterIdx + 1]
        if (!nextChapter) {
          return
        }

        const chapterFilename = getChapterFilename(
          targetChapterIdx + 1,
          codec ?? "mp3",
        ).filename

        const nextTranscodePath = getProcessedAudioFilepath(
          book,
          chapterFilename,
        )
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

        return
      })

      // check if transcode directory exists
      const transcodeDir = dirname(transcodePath)
      if (!existsSync(transcodeDir)) {
        // return Response.json({ message: "Transcode directory not found" }, { status: 404 })
        await mkdir(transcodeDir, { recursive: true })
      }

      // TODO: do slightly better check in case of corruption
      if (existsSync(transcodePath)) {
        return await streamPartialFile(request, transcodePath)
      }

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
    } else {
      // handle directory-based files
      const filePath = join(audiobookPath, requestedFile)

      try {
        return await streamPartialFile(request, filePath)
      } catch {
        return Response.json({ message: "File not found" }, { status: 404 })
      }
    }
  } catch (error) {
    logger.error({ msg: "Error in audiobook listen endpoint:", err: error })
    return Response.json({ message: "Internal server error" }, { status: 500 })
  }
})

/**
 * See https://smoores.dev/post/http_range_requests/#range-requests-implementation
 */
export const streamPartialFile = async (
  request: NextRequest,
  filepath: string,
) => {
  const ifRange = request.headers.get("If-Range")?.valueOf()
  const range = request.headers.get("Range")?.valueOf()
  const rangesString = range?.replace("bytes=", "")
  const rangeStrings = rangesString?.split(",")

  let file: FileHandle
  try {
    file = await open(filepath)
  } catch {
    return new Response(null, { status: 404 })
  }

  const stats = await file.stat()
  const mimeType = lookup(filepath)
  const lastModified = new Date(stats.mtime).toISOString()
  const etagBase = `${stats.mtime.valueOf()}-${stats.size}`
  const etag = `"${createHash("md5").update(etagBase).digest("hex")}"`

  let start = 0
  let end = stats.size - 1

  const partialResponse =
    range?.startsWith("bytes=") &&
    // We're only supporting single ranges for now
    rangeStrings?.length === 1 &&
    (!ifRange || ifRange === etag || ifRange === lastModified)

  if (partialResponse) {
    const firstRangeString = rangeStrings[0]

    const [startString, endString] = (firstRangeString?.trim().split("-") ??
      []) as [string, string]

    try {
      const parsedStart = parseInt(startString.trim(), 10)
      if (!Number.isNaN(parsedStart)) {
        start = parsedStart
      }
      const parsedEnd = parseInt(endString.trim(), 10)
      if (!Number.isNaN(parsedEnd)) {
        end = Math.min(parsedEnd, stats.size - 1)
      }
    } catch {
      // If the ranges weren't valid, then leave the defaults
    }
  }

  if (start > stats.size - 1) {
    await file.close()
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stats.size}` },
    })
  }

  const nodeStream = file.createReadStream({ start, end, autoClose: true })

  // attempt handle client disconnections and stream errors gracefully
  nodeStream.on("error", async (error) => {
    // client disconnections are expected when skipping/pausing, don't log them
    if (error.name === "ResponseAborted") {
      logger.debug({ msg: "response aborted", err: error })
      await file.close()
      return
    }

    if (
      error.message !== "aborted" &&
      error.name !== "ERR_STREAM_PREMATURE_CLOSE"
    ) {
      logger.error({ msg: "Stream error", err: error })
    }
  })

  nodeStream.on("close", async () => {
    await file.close()
  })
  const readableStream = createReadableStreamFromReadable(nodeStream)
  const response = new Response(readableStream, {
    status: partialResponse ? 206 : 200,
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Length": `${end - start + 1}`,
      "Accept-Ranges": "bytes",
      "Last-Modified": new Date(stats.mtime).toString(),
      Etag: etag,
      ...(partialResponse && {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      }),
    },
  })

  return response
}
