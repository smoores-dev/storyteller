import { randomBytes } from "node:crypto"
import { mkdir, readdir, rm } from "node:fs/promises"
import { basename, extname, join } from "node:path"

import { FileStore } from "@tus/file-store"
import { Server } from "@tus/server"
import { type NextRequest } from "next/server"

import { MediaType } from "@storyteller-platform/media-types"

import { importDebugBundle, isDebugBundle } from "@/assets/debugBundle"
import { move } from "@/assets/fs"
import { scan } from "@/assets/library/scanner/scan"
import { type Candidate } from "@/assets/library/scanner/types"
import { isAudioFile, isZipArchive } from "@/audio"
import { withHasPermission } from "@/auth/auth"
import { UPLOADS_DIR } from "@/directories"
import { isEpubFile } from "@/epub"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

const inProgressBatchScans = new Set<string>()

function parseCount(raw: string | null | undefined): number | null {
  return raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : null
}

// what the scanner can actually import out of the upload folder
async function importableEntries(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch(() => [] as string[])
  return entries.filter(
    (name) => isEpubFile(name) || isAudioFile(name) || isZipArchive(name),
  )
}

/* the default naming func found in @tus/server */
const defaultNamingFunc = () => randomBytes(16).toString("hex")

const server = new Server({
  path: "/api/v2/books/upload",
  respectForwardedHeaders: true,
  onResponseError(_req, err) {
    if ("status_code" in err && err.status_code === 404) return undefined
    logger.error(`Upload server encountered error`)
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
        status_code: 405,
        body: "Missing required file metadata: bookId, filename, filetype (optional)",
      }
    }

    try {
      const bookUuid = upload.metadata["bookUuid"] as UUID | undefined
      if (!bookUuid) {
        return { status_code: 405, body: "Missing required metadata: bookUuid" }
      }

      const filename = upload.metadata["filename"]
      if (!filename) {
        return { status_code: 405, body: "Missing required metadata: filename" }
      }

      const filetype =
        upload.metadata["filetype"] ?? MediaType.fromPath(filename)?.mime

      const collectionUuid = upload.metadata["collection"] as UUID | undefined

      const isEpub =
        filetype !== undefined &&
        MediaType.fromMime(filetype) === MediaType.EPUB

      const isAudiobook = isAudioFile(filename) || isZipArchive(filename)
      if (!isEpub && !isAudiobook) {
        return {
          status_code: 405,
          body: `Invalid upload type. Expected application/epub+zip, audio/*, or video/mp4, received "${upload.metadata["filetype"]}" from browser and "${MediaType.fromPath(filename)?.mime}" from extension`,
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const uploadPath = upload.storage!.path
      // make uuid dir in uploads dir
      const uuidDir = join(UPLOADS_DIR, bookUuid)
      await mkdir(uuidDir, { recursive: true })

      const newUploadPath = join(uuidDir, filename)
      await move(uploadPath, newUploadPath)

      if (isZipArchive(filename) && (await isDebugBundle(newUploadPath))) {
        await importDebugBundle({
          zipPath: newUploadPath,
          bookUuid,
          collectionUuid,
        })
        return {}
      }

      const totalFiles = parseCount(upload.metadata["totalFiles"]) ?? 1
      let claimedScan = false

      if (totalFiles > 1) {
        if (inProgressBatchScans.has(bookUuid)) return {}

        const arrived = (await importableEntries(uuidDir)).length
        if (arrived < totalFiles) return {}

        if (inProgressBatchScans.has(bookUuid)) return {}
        inProgressBatchScans.add(bookUuid)
        claimedScan = true
      }

      try {
        const entries = await importableEntries(uuidDir)
        const audioEntries = entries.filter(
          (name) => isAudioFile(name) || isZipArchive(name),
        )
        const epubEntries = entries.filter((name) => isEpubFile(name))

        const collections = collectionUuid
          ? { collections: [collectionUuid] }
          : {}

        const candidates: Candidate[] = [
          ...epubEntries.map<Candidate>((name) => ({
            folder: uuidDir,
            format: "ebook",
            filepath: join(uuidDir, name),
            titleHint: basename(name, extname(name)),
            bookUuidHint: bookUuid,
            ...collections,
            importMode: "move",
            epub2ImportStrategy: "replace",
          })),
          ...(audioEntries.length
            ? [
                {
                  folder: uuidDir,
                  format: "audiobook" as const,
                  filepath: uuidDir,
                  titleHint: basename(
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    audioEntries[0]!,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    extname(audioEntries[0]!),
                  ),
                  bookUuidHint: bookUuid,
                  ...collections,
                  importMode: "move" as const,
                },
              ]
            : []),
        ]

        await scan({
          source: "upload",
          request: { kind: "candidates", candidates },
          options: { force: true },
          signal: new AbortController().signal,
        })
      } finally {
        if (claimedScan) inProgressBatchScans.delete(bookUuid)
      }

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

export const GET = withHasPermission("bookCreate")(async (req: NextRequest) =>
  server.handleWeb(req),
)
export const PATCH = withHasPermission("bookCreate")(async (req: NextRequest) =>
  server.handleWeb(req),
)
export const POST = withHasPermission("bookCreate")(async (req: NextRequest) =>
  server.handleWeb(req),
)
export const DELETE = withHasPermission("bookCreate")(
  async (req: NextRequest) => server.handleWeb(req),
)
export const OPTIONS = withHasPermission("bookCreate")(
  async (req: NextRequest) => server.handleWeb(req),
)
export const HEAD = withHasPermission("bookCreate")(async (req: NextRequest) =>
  server.handleWeb(req),
)
