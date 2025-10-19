import { createHash } from "node:crypto"
import { extname } from "node:path"

import { type NextRequest } from "next/server"

import { assertHasPermission } from "@/auth/auth"
import { type BookWithRelations, getBook } from "@/database/books"
import { getSettings } from "@/database/settings"
import { type UserWithPermissions } from "@/database/users"
import { logger } from "@/logging"
import { getReadiumService } from "@/services/readiumService"
import { getContentTimestamp } from "@/utils/cacheBustingFetch"
import { type UUID } from "@/uuid"

type Params = {
  bookId: UUID
  path: string[]
}

const ONE_SECOND = 1_000
const ONE_MINUTE = 60 * ONE_SECOND
const ONE_HOUR = 60 * ONE_MINUTE
const ONE_DAY = 24 * ONE_HOUR
const ONE_WEEK = 7 * ONE_DAY
const ONE_YEAR = 365 * ONE_DAY

// cache configuration for different resource types
const CACHE_RULES = {
  immutable: {
    patterns: [/\.css$/, /\.js$/, /\.woff2?$/, /\.ttf$/, /\.otf$/, /\.eot$/],
    maxAge: ONE_YEAR,
    directive: `public, max-age=${ONE_YEAR}, immutable`,
  },
  longTerm: {
    patterns: [/manifest\.json$/, /\.json$/, /\.xml$/],
    maxAge: ONE_DAY,
    directive: `public, max-age=${ONE_DAY}, must-revalidate`,
  },
  shortTerm: {
    patterns: [/\.html?$/, /\.xhtml$/],
    maxAge: ONE_HOUR,
    directive: `public, max-age=${ONE_HOUR}, must-revalidate`,
  },
  images: {
    patterns: [/\.(jpg|jpeg|png|gif|svg|webp)$/i],
    maxAge: ONE_WEEK,
    directive: `public, max-age=${ONE_WEEK}, must-revalidate`,
  },
  media: {
    patterns: [/\.(mp3|wav|ogg|m4a|aac|webm|mp4)$/i],
    maxAge: ONE_WEEK,
    directive: `public, max-age=${ONE_HOUR}, must-revalidate`,
  },
  default: {
    patterns: [],
    maxAge: ONE_HOUR,
    directive: `public, max-age=${ONE_HOUR}, must-revalidate`,
  },
} as const

function getCacheRule(path: string) {
  for (const [name, rule] of Object.entries(CACHE_RULES)) {
    if (name === "default") continue
    if (rule.patterns.some((pattern) => pattern.test(path))) {
      return rule
    }
  }
  return CACHE_RULES.default
}

function generateETag(
  bookId: string,
  path: string,
  version: string,
  contentTimestamp?: string,
) {
  const hash = createHash("sha256")
  hash.update(bookId)
  hash.update(path)
  hash.update(version)
  if (contentTimestamp) {
    hash.update(contentTimestamp)
  }
  return `"${hash.digest("hex").slice(0, 16)}"`
}

function checkIfNoneMatch(request: Request, etag: string): boolean {
  const ifNoneMatch = request.headers.get("if-none-match")
  if (!ifNoneMatch) return false

  // handle both single etag and comma-separated list
  const etags = ifNoneMatch.split(",").map((e) => e.trim())
  return etags.includes(etag) || etags.includes("*")
}

async function rwp(
  book: BookWithRelations,
  path: string,
  searchParams: URLSearchParams,
  init?: RequestInit & { headers: Headers },
) {
  const bookPath = book.readaloud?.filepath || book.ebook?.filepath
  if (!bookPath) {
    throw new Error("Book path not found")
  }

  const readiumService = getReadiumService()

  // ensure service is running before making request
  if (!readiumService.isRunning()) {
    logger.warn("Readium service not running, attempting to start")
    await readiumService.start()
  }

  const response = await readiumService.makeRequest(
    bookPath,
    path,
    searchParams,
    init,
  )

  return response
}

export const GET = async (
  request: NextRequest,
  context: { params: Promise<Params> },
) => {
  const extension = extname(request.nextUrl.pathname)
  // in safari the iframe cannot easily access the cookies
  // TODO: figure out how to do that using the storage access api
  const skipAuth = [
    ".jpeg",
    ".jpg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".css",
  ].includes(extension)

  let user: UserWithPermissions | undefined
  if (!skipAuth) {
    user = await assertHasPermission("bookRead")
  }

  const { bookId, path: pathSegments } = await context.params
  const searchParams = request.nextUrl.searchParams
  const path = pathSegments.join("/")

  const cacheBust =
    searchParams.get("v") ||
    searchParams.get("version") ||
    searchParams.get("bust") ||
    request.headers.get("x-cache-bust") ||
    request.headers.get("x-content-version")
  const noCacheRequested =
    searchParams.has("no-cache") ||
    request.headers.get("cache-control")?.includes("no-cache") ||
    request.headers.has("x-cache-bust")

  const [book] = await Promise.all([getBook(bookId, user?.id), getSettings()])

  if (!book) {
    return Response.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const contentTimestamp = getContentTimestamp(book)

  // get app version for cache busting
  const appVersion = process.env["npm_package_version"] || "2.0.7"
  const cacheVersion = cacheBust || `${appVersion}-${contentTimestamp}`

  const etag = generateETag(bookId, path, cacheVersion, contentTimestamp)

  // skip cache check if no-cache is requested
  if (!noCacheRequested && checkIfNoneMatch(request, etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "X-Content-Timestamp": contentTimestamp,
      },
    })
  }

  const cacheRule = getCacheRule(path)

  const newHeaders = new Headers(request.headers)
  // we don't want readium to compress the response
  newHeaders.set("Accept-Encoding", "identity")

  const abortController = new AbortController()

  // if client disconnects, abort the readium request
  request.signal.addEventListener("abort", () => {
    logger.debug(`Client disconnected, aborting readium request for ${path}`)
    abortController.abort()
  })

  const response = await rwp(book, path, searchParams, {
    headers: newHeaders,
    signal: abortController.signal,
    cache: request.cache,
    keepalive: request.keepalive,
    integrity: request.integrity,
  })

  if (!response.body) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
    })
  }

  const responseHeaders = new Headers(response.headers)
  responseHeaders.set("ETag", etag)
  responseHeaders.set("X-Content-Timestamp", contentTimestamp)
  responseHeaders.set(
    "Cache-Control",
    noCacheRequested
      ? "no-cache, no-store, must-revalidate"
      : cacheRule.directive,
  )
  responseHeaders.set("Vary", "Authorization")

  // we need to do this somewhat awkward song-and-dance because otherwise the stream will stay open, like, forever, until readium times it out
  // weirdly that doesn't cause any issues seemingly other than some errors in the console, but probably best to handle it properly
  const reader = response.body.getReader()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
        controller.close()
      } catch (error) {
        // if aborted, cancel the upstream reader
        reader.cancel().catch(() => {})
        if (
          error instanceof Error &&
          (error.name === "AbortError" || error.message.includes("aborted"))
        ) {
          logger.debug(`Stream aborted for ${path}`)
        } else {
          logger.error(`Stream error for ${path}`, error)
          controller.error(error)
        }
      }
    },
    // V this is the most important part
    cancel() {
      // when client cancels, cancel the upstream reader
      logger.debug(`Client cancelled stream for ${path}`)
      reader.cancel().catch(() => {})
      abortController.abort()
    },
  })

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}
