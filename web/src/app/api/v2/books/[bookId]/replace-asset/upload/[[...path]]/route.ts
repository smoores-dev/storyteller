import { randomBytes } from "node:crypto"
import { rm } from "node:fs/promises"
import { extname } from "node:path"

import { FileStore } from "@tus/file-store"
import { Server } from "@tus/server"
import { type NextRequest } from "next/server"
import { z } from "zod"

import { replaceBookAssetFromUpload } from "@/assets/library/scanner/replaceAsset"
import { type ScanFormat } from "@/assets/library/scanner/types"
import { withHasPermission } from "@/auth/auth"
import { getBook, getBookUuid } from "@/database/books"
import { MetadataFieldOverridesSchema } from "@/database/settingsTypes"
import { UPLOADS_DIR } from "@/directories"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

const FormatSchema = z.enum(["ebook", "audiobook", "readaloud"] as const)

const defaultNamingFunc = () => randomBytes(16).toString("hex")

const UPLOAD_SEGMENT = "/replace-asset/upload"

function extractUploadBasePath(url: string): string {
  const pathname = new URL(url, "http://localhost").pathname
  const idx = pathname.indexOf(UPLOAD_SEGMENT)
  if (idx === -1) return pathname

  return pathname.slice(0, idx + UPLOAD_SEGMENT.length)
}

const server = new Server({
  path: "/api/v2/books",
  respectForwardedHeaders: true,
  allowedCredentials: true,

  getFileIdFromRequest(_req, lastPath) {
    if (!lastPath || lastPath === "upload") return undefined
    return lastPath
  },

  generateUrl(req, { id }) {
    const base = extractUploadBasePath(req.url)
    return `${base}/${id}`
  },

  onResponseError(_req, err) {
    if ("status_code" in err && err.status_code === 404) return undefined
    logger.error(`Replace-asset upload server encountered error`)
    logger.error(err)
    return undefined
  },

  datastore: new FileStore({ directory: UPLOADS_DIR }),

  namingFunction(_req, metadata) {
    if (!metadata?.["filename"]) return defaultNamingFunc()

    const extension = extname(metadata["filename"])
    if (!extension) return defaultNamingFunc()

    return `${defaultNamingFunc()}${extension}`
  },

  onUploadFinish: async (_req, upload) => {
    if (!upload.metadata) {
      return {
        status_code: 400,
        body: "Missing required file metadata: format, filename",
      }
    }

    try {
      const bookUuid = upload.metadata["bookUuid"] as UUID | undefined
      if (!bookUuid) {
        return { status_code: 400, body: "Missing required metadata: bookUuid" }
      }

      const format = FormatSchema.safeParse(upload.metadata["format"])
      if (!format.success) {
        return {
          status_code: 400,
          body: "Missing or invalid metadata: format (must be ebook, audiobook, or readaloud)",
        }
      }

      const filename = upload.metadata["filename"]
      if (!filename) {
        return { status_code: 400, body: "Missing required metadata: filename" }
      }

      const book = await getBook(bookUuid)
      if (!book) {
        return { status_code: 404, body: `Book not found: ${bookUuid}` }
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const uploadPath = upload.storage!.path

      let metadataFieldOverrides = undefined
      const overridesRaw = upload.metadata["metadataFieldOverrides"]

      if (overridesRaw) {
        const parsed = MetadataFieldOverridesSchema.safeParse(
          JSON.parse(overridesRaw),
        )

        if (parsed.success) {
          metadataFieldOverrides = parsed.data
        }
      }

      const relativePath =
        upload.metadata["relativePath"] === "null" ||
        !upload.metadata["relativePath"]
          ? filename
          : upload.metadata["relativePath"]

      await replaceBookAssetFromUpload({
        book,
        uploadPath,
        format: format.data as ScanFormat,
        relativePath: format.data === "audiobook" ? relativePath : undefined,
        metadataFieldOverrides,
        signal: new AbortController().signal,
      })

      return {}
    } catch (e) {
      logger.error(e)
      throw e
    } finally {
      if (upload.storage?.path) {
        await rm(upload.storage.path, { force: true })
        await rm(`${upload.storage.path}.json`, { force: true })
      }
    }
  },
})

type Params = Promise<{
  bookId: string
}>

async function validateBook(params: Promise<Params>) {
  const { bookId } = await params
  return await getBookUuid(bookId)
}

export const GET = withHasPermission<Params>("bookUpdate")(async (
  req: NextRequest,
  ctx,
) => {
  await validateBook(ctx.params)
  return server.handleWeb(req)
})

export const PATCH = withHasPermission<Params>("bookUpdate")(async (
  req: NextRequest,
  ctx,
) => {
  await validateBook(ctx.params)
  return server.handleWeb(req)
})

export const POST = withHasPermission<Params>("bookUpdate")(async (
  req: NextRequest,
  ctx,
) => {
  await validateBook(ctx.params)
  return server.handleWeb(req)
})

export const DELETE = withHasPermission<Params>("bookUpdate")(async (
  req: NextRequest,
  ctx,
) => {
  await validateBook(ctx.params)
  return server.handleWeb(req)
})

export const OPTIONS = withHasPermission<Params>("bookUpdate")(async (
  req: NextRequest,
  ctx,
) => {
  await validateBook(ctx.params)
  return server.handleWeb(req)
})

export const HEAD = withHasPermission<Params>("bookUpdate")(async (
  req: NextRequest,
  ctx,
) => {
  await validateBook(ctx.params)
  return server.handleWeb(req)
})
