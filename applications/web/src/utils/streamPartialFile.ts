import { createHash } from "node:crypto"
import { type FileHandle, open } from "node:fs/promises"

import { createReadableStreamFromReadable } from "@remix-run/node"

import { MediaType } from "@storyteller-platform/media-types"

import { logger } from "@/logging"

export type ByteRange = { start: number; end: number }

export const UNSATISFIABLE = "unsatisfiable"

export type RequestedRange = ByteRange | typeof UNSATISFIABLE | null

export function parseByteRange(
  header: string | null,
  size: number,
): RequestedRange {
  if (!header?.startsWith("bytes=")) return null

  const specs = header.slice("bytes=".length).split(",")
  if (specs.length !== 1) return null

  const parts = (specs[0] ?? "").split("-")
  if (parts.length !== 2) return null

  const startText = (parts[0] ?? "").trim()
  const endText = (parts[1] ?? "").trim()

  if (startText === "") {
    const suffix = Number(endText)
    if (endText === "" || !Number.isInteger(suffix) || suffix < 0) return null
    if (suffix === 0 || size === 0) return UNSATISFIABLE
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(startText)
  if (!Number.isInteger(start) || start < 0) return null
  if (start >= size) return UNSATISFIABLE
  if (endText === "") return { start, end: size - 1 }

  const end = Number(endText)
  if (!Number.isInteger(end) || end < start) return null

  return { start, end: Math.min(end, size - 1) }
}

export async function streamPartialFile(
  request: Request,
  filepath: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  let file: FileHandle
  try {
    file = await open(filepath)
  } catch {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
    })
  }

  const stats = await file.stat()
  const mimeType = MediaType.fromPath(filepath)?.mime
  const lastModified = new Date(stats.mtime).toISOString()
  const etagBase = `${stats.mtime.valueOf()}-${stats.size}`
  const etag = `"${createHash("md5").update(etagBase).digest("hex")}"`

  const ifRange = request.headers.get("If-Range")?.valueOf()
  const requested =
    !ifRange || ifRange === etag || ifRange === lastModified
      ? parseByteRange(request.headers.get("Range"), stats.size)
      : null

  if (requested === UNSATISFIABLE) {
    await file.close()
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${stats.size}`,
      },
    })
  }

  const { start, end } = requested ?? { start: 0, end: stats.size - 1 }

  const nodeStream = file.createReadStream({ start, end, autoClose: true })

  nodeStream.on("error", async (error) => {
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

  return new Response(createReadableStreamFromReadable(nodeStream), {
    status: requested ? 206 : 200,
    headers: {
      "Content-Type": mimeType ?? MediaType.OCTET_STREAM.mime,
      "Content-Length": `${end - start + 1}`,
      "Accept-Ranges": "bytes",
      "Last-Modified": new Date(stats.mtime).toString(),
      Etag: etag,
      ...(requested && {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      }),
      ...extraHeaders,
    },
  })
}
