import { buildReportView } from "@/alignmentReportView"
import { getProcessedAudioFilepath } from "@/assets/paths"
import { withHasPermission } from "@/auth/auth"
import {
  type AlignmentOverrides,
  getAlignmentReportForBook,
  updateAlignmentOverrides,
} from "@/database/alignmentReports"
import { getBook } from "@/database/books"
import { getJob } from "@/database/jobs";
import { createDirectoryManifest } from "@/utils/audioManifest"
import type { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string }>

type ManifestLike = {
  readingOrder?: { href?: string; title?: string; duration?: number }[]
  toc?: { href?: string; title?: string }[]
}

/**
 * @description Get a book's enriched alignment report
 * @pathParams BookIdParamsSchemaV2
 * @response AlignmentReportViewSchemaV2
 * @auth bearer
 * @openapi
 */
export const GET = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = bookId as UUID

  const [report, book] = await Promise.all([
    getAlignmentReportForBook(bookUuid),
    getBook(bookUuid, request.auth.user.id),
  ])

  if (!report?.report) {
    return Response.json(
      { message: `No alignment report for book ${bookId}` },
      { status: 404 },
    )
  }

  if (!book) {
    return Response.json(
      { message: `Book ${bookId} not found` },
      { status: 404 },
    )
  }

  const overrides = report.overrides
    ? typeof report.overrides === "string"
      ? (JSON.parse(report.overrides) as AlignmentOverrides)
      : report.overrides
    : null


  const job = await getJob(report.jobUuid)

  const transcodedAudioDir = getProcessedAudioFilepath(book)
  const audiobookManifest = await createDirectoryManifest(transcodedAudioDir, {
    bookId: book.uuid,
    updatedAt: new Date(book.updatedAt),
    title: book.title,
    subtitle: book.subtitle ?? undefined,
    description: book.description ?? undefined,
    language: book.language ?? undefined,
  })

  const view = buildReportView({
    report: report.report,
    bookUuid,
    bookTitle: book.title,
    reportUuid: report.uuid,
    jobUuid: report.jobUuid,
    createdAt: report.createdAt,
    overrides,
    ebookManifest: (book.ebook?.manifest as ManifestLike | null) ?? null,
    audiobookManifest:
      (audiobookManifest.serialize() as ManifestLike | null) ?? null,
  })

  return Response.json(view)
})

/**
 * @description Replace the overrides on a book's latest alignment report
 * @pathParams BookIdParamsSchemaV2
 * @request AlignmentOverridesSchemaV2
 * @auth bearer
 * @openapi
 */
export const PATCH = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = bookId as UUID

  const report = await getAlignmentReportForBook(bookUuid)
  if (!report) {
    return Response.json(
      { message: `No alignment report for book ${bookId}` },
      { status: 404 },
    )
  }

  const overrides = (await request.json()) as AlignmentOverrides
  await updateAlignmentOverrides(report.uuid, overrides)

  return Response.json({ ok: true })
})
