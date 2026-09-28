import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { rename, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { type ReadableStream as NodeReadableStream } from "node:stream/web"

import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod/v4"

import { Scratch } from "../utilities/Scratch.ts"

import { binary, error, errorResponses, openApi } from "./openapi.ts"
import {
  type StoredFile,
  fileQuerySchema,
  sha256Schema,
  storedFileSchema,
} from "./protocol.ts"

export interface FileLease extends AsyncDisposable {
  path: string
  size: number
}

export interface FileStore {
  put(
    sha256: string,
    body: Readable,
    options: { ext?: string | undefined; signal?: AbortSignal | null },
  ): Promise<{ created: boolean; file: StoredFile }>
  adopt(
    path: string,
    options: { ext?: string | undefined; signal?: AbortSignal | null },
  ): Promise<StoredFile>
  open(sha256: string): Promise<FileLease | null>
  [Symbol.asyncDispose]: () => Promise<void>
}

export class HashMismatchError extends Error {}

export interface DiskFileStoreOptions {
  maxBytes?: number | undefined
  idleTimeout?: number | undefined
}

type Entry = { path: string; size: number; used: number; leases: number }

const RM_OPTIONS = { force: true, recursive: true, maxRetries: 3 } as const

export async function diskFileStore(
  options: DiskFileStoreOptions = {},
): Promise<FileStore> {
  const scratch = await Scratch.create()
  const maxBytes = options.maxBytes ?? 10 * 1024 ** 3
  const idleTimeout = options.idleTimeout ?? 60 * 60 * 1000
  const entries = new Map<string, Entry>()

  const drop = async (sha256: string, entry: Entry) => {
    entries.delete(sha256)
    await rm(entry.path, RM_OPTIONS)
  }

  const evict = async (keep: string) => {
    let total = [...entries.values()].reduce((sum, e) => sum + e.size, 0)
    const idle = [...entries]
      .filter(([sha256, entry]) => sha256 !== keep && entry.leases === 0)
      .toSorted(([, a], [, b]) => a.used - b.used)
    for (const [sha256, entry] of idle) {
      if (total <= maxBytes) {
        break
      }
      total -= entry.size
      await drop(sha256, entry)
    }
  }

  const sweep = setInterval(
    () => {
      const cutoff = Date.now() - idleTimeout
      for (const [sha256, entry] of entries) {
        if (entry.leases === 0 && entry.used < cutoff) {
          void drop(sha256, entry)
        }
      }
    },
    Math.min(idleTimeout, 60 * 1000),
  )
  sweep.unref()

  const admit = async (sha256: string, partial: string, ext?: string) => {
    const raced = entries.get(sha256)
    if (raced) {
      raced.used = Date.now()
      await rm(partial, RM_OPTIONS)
      return { created: false, file: { sha256, size: raced.size } }
    }
    const path = join(scratch.path, `${sha256}${ext ?? ""}`)
    await rename(partial, path)
    const { size } = await stat(path)
    entries.set(sha256, { path, size, used: Date.now(), leases: 0 })
    await evict(sha256)
    return { created: true, file: { sha256, size } }
  }

  const store: FileStore = {
    async put(sha256, body, { ext, signal }) {
      const existing = entries.get(sha256)
      if (existing) {
        existing.used = Date.now()
        return { created: false, file: { sha256, size: existing.size } }
      }
      const partial = scratch.unique(".partial")
      const hash = createHash("sha256")
      try {
        await pipeline(
          body,
          async function* (source: AsyncIterable<Buffer>) {
            for await (const chunk of source) {
              hash.update(chunk)
              yield chunk
            }
          },
          createWriteStream(partial),
          { signal: signal ?? undefined },
        )
        const actual = hash.digest("hex")
        if (actual !== sha256) {
          throw new HashMismatchError(
            `The upload hashes to ${actual}, not ${sha256}`,
          )
        }
        return await admit(sha256, partial, ext)
      } catch (cause) {
        await rm(partial, RM_OPTIONS)
        throw cause
      }
    },

    async adopt(path, { ext, signal }) {
      try {
        const hash = createHash("sha256")
        for await (const chunk of createReadStream(path, {
          signal: signal ?? undefined,
        })) {
          hash.update(chunk as Buffer)
        }
        const { file } = await admit(hash.digest("hex"), path, ext)
        return file
      } catch (cause) {
        await rm(path, RM_OPTIONS)
        throw cause
      }
    },

    open(sha256) {
      const entry = entries.get(sha256)
      if (!entry) {
        return Promise.resolve(null)
      }
      entry.leases++
      entry.used = Date.now()
      return Promise.resolve({
        path: entry.path,
        size: entry.size,
        [Symbol.asyncDispose]() {
          entry.leases--
          entry.used = Date.now()
          return Promise.resolve()
        },
      })
    },

    async [Symbol.asyncDispose]() {
      clearInterval(sweep)
      entries.clear()
      await scratch[Symbol.asyncDispose]()
    },
  }
  return store
}

export function fileRoutes(files: FileStore): Hono {
  const param = z.object({ sha256: sha256Schema })
  return new Hono()
    .get(
      "/:sha256",
      openApi({
        tags: ["Files"],
        summary: "Download a file",
        description:
          "Send HEAD instead of GET to check whether the server has a file, so a file it still has from earlier is not uploaded again.",
        request: { param },
        responses: {
          200: {
            description: "The file.",
            content: { "application/octet-stream": { schema: binary } },
          },
          404: error("The server does not have this file."),
          ...errorResponses,
        },
      }),
      async (c) => {
        const { sha256 } = c.req.valid("param")
        const file = await files.open(sha256)
        if (!file) {
          throw new HTTPException(404, { message: `No file ${sha256}` })
        }
        const headers = {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(file.size),
        }
        if (c.req.method === "HEAD") {
          await file[Symbol.asyncDispose]()
          return new Response(null, { headers })
        }
        const stream = createReadStream(file.path)
        stream.once("close", () => {
          void file[Symbol.asyncDispose]()
        })
        return new Response(Readable.toWeb(stream) as ReadableStream, {
          headers,
        })
      },
    )
    .put(
      "/:sha256",
      openApi({
        tags: ["Files"],
        summary: "Upload a file",
        description:
          "Send the file as the raw request body. The server checks it against the hash in the path. Files the server has not used for an hour, or that no longer fit in its cache, are removed.",
        request: { param, query: fileQuerySchema },
        requestBody: {
          required: true,
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        responses: {
          200: {
            description: "The server already had the file.",
            schema: storedFileSchema,
          },
          201: {
            description: "The file was stored.",
            schema: storedFileSchema,
          },
          400: error("The request is malformed."),
          422: error("The body does not match the hash."),
          ...errorResponses,
        },
      }),
      async (c) => {
        const { sha256 } = c.req.valid("param")
        const { ext } = c.req.valid("query")
        const body = c.req.raw.body
        if (!body) {
          throw new HTTPException(400, {
            message: "Expected the file in the body",
          })
        }
        try {
          const { created, file } = await files.put(
            sha256,
            Readable.fromWeb(body as NodeReadableStream<Uint8Array>),
            { ext, signal: c.req.raw.signal },
          )
          return c.json(file, created ? 201 : 200)
        } catch (cause) {
          if (cause instanceof HashMismatchError) {
            throw new HTTPException(422, { message: cause.message })
          }
          throw cause
        }
      },
    )
}
