import { rm, stat } from "node:fs/promises"

import { NextResponse } from "next/server"
import { z } from "zod"

import { pathBelongsTo } from "@/assets/library/scanner/folder"
import { relocateIfNeeded } from "@/assets/library/scanner/relocate"
import { scanBooks } from "@/assets/library/scanner/scan"
import { type ScanFormat } from "@/assets/library/scanner/types"
import { withHasPermission } from "@/auth/auth"
import {
  getBook,
  getBookUuid,
  removeBookFormat,
  updateBook,
} from "@/database/books"
import { getSetting } from "@/database/settings"
import {
  ImportModeSchema,
  MetadataFieldOverridesSchema,
} from "@/database/settingsTypes"
import { ASSETS_DIR } from "@/directories"
import { BookEvents } from "@/events"
import { logger } from "@/logging"

export const dynamic = "force-dynamic"

type Params = Promise<{
  bookId: string
}>

const FormatSchema = z.enum(["ebook", "audiobook", "readaloud"] as const)

const BodySchema = z.object({
  format: FormatSchema,
  path: z.string().min(1),
  importMode: ImportModeSchema.optional(),
  metadataFieldOverrides: MetadataFieldOverridesSchema.optional(),
})

export const POST = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return NextResponse.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const json = (await request.json().catch(() => null)) as unknown
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { format, path, importMode, metadataFieldOverrides } = parsed.data

  try {
    const stats = await stat(path)
    if (format === "audiobook" && !stats.isDirectory()) {
      return NextResponse.json(
        { message: "Audiobook source path must be a directory" },
        { status: 400 },
      )
    }
    if (format !== "audiobook" && !stats.isFile()) {
      return NextResponse.json(
        { message: `${format} source path must be a file` },
        { status: 400 },
      )
    }
  } catch {
    return NextResponse.json(
      { message: `Source path does not exist: ${path}` },
      { status: 400 },
    )
  }

  const resolvedImportMode = importMode ?? (await getSetting("importMode"))

  await relocateIfNeeded(book, path, format as ScanFormat, resolvedImportMode)

  if (resolvedImportMode === "reference") {
    await updateBook(book.uuid, null, {
      [format]: {
        filepath: path,
        missing: false,
        ...(format === "readaloud" && {
          status: book.readaloud?.status ?? "ALIGNED",
          currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
        }),
      },
    })
  }

  await scanBooks({
    source: "api",
    bookUuids: [book.uuid],
    options: {
      force: true,
      importMode: resolvedImportMode,
      ...(metadataFieldOverrides && { metadataFieldOverrides }),
    },
    signal: request.signal,
  })

  const updated = await getBook(book.uuid, request.auth.user.id)
  if (updated) {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: updated,
    })
  }

  return NextResponse.json(updated ?? book)
})

export const DELETE = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = await getBookUuid(bookId)
  const book = await getBook(bookUuid, request.auth.user.id)
  if (!book) {
    return NextResponse.json(
      { message: `Could not find book with id ${bookId}` },
      { status: 404 },
    )
  }

  const formatParam = request.nextUrl.searchParams.get("format")
  const formatParsed = FormatSchema.safeParse(formatParam)
  if (!formatParsed.success) {
    return NextResponse.json(
      { message: "Missing or invalid format query param" },
      { status: 400 },
    )
  }
  const format = formatParsed.data

  const filepath = await removeBookFormat(book.uuid, format)

  // readaloud is a storyteller artifact, always delete. reference-mode
  // ebook/audiobook (outside ASSETS_DIR) stay on disk.
  if (filepath) {
    const shouldDelete =
      format === "readaloud" || pathBelongsTo(ASSETS_DIR, filepath)
    if (shouldDelete) {
      try {
        await rm(filepath, {
          recursive: format === "audiobook",
          force: true,
        })
      } catch (e) {
        logger.error({
          msg: "Failed to delete file during format removal",
          filepath,
          format,
          err: e,
        })
      }
    }
  }

  const updated = await getBook(book.uuid, request.auth.user.id)
  return NextResponse.json(updated)
})
