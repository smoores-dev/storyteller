import { buildReportView } from "@/alignmentReportView"
import { withHasPermission } from "@/auth/auth"
import {
  type AlignmentOverrides,
  getAlignmentReportForBook,
  summarizeReport,
  updateAlignmentOverrides,
} from "@/database/alignmentReports"
import { getBook } from "@/database/books"
import type { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string }>

type ManifestLike = {
  readingOrder?: { href?: string; title?: string; duration?: number }[]
  toc?: { href?: string; title?: string }[]
}

export const GET = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { bookId } = await context.params
  const bookUuid = bookId as UUID

  const report = await getAlignmentReportForBook(bookUuid)
  if (!report?.report) {
    return Response.json(
      { message: `No alignment report for book ${bookId}` },
      { status: 404 },
    )
  }

  const book = await getBook(bookUuid, request.auth.user.id)

  const overrides = report.overrides
    ? typeof report.overrides === "string"
      ? (JSON.parse(report.overrides) as AlignmentOverrides)
      : report.overrides
    : null

  const view = buildReportView({
    report: report.report,
    bookUuid,
    bookTitle: book?.title ?? null,
    reportUuid: report.uuid,
    jobUuid: report.jobUuid,
    createdAt: report.createdAt,
    summary: summarizeReport(report.report, overrides),
    overrides,
    ebookManifest: (book?.ebook?.manifest as ManifestLike | null) ?? null,
    audiobookManifest:
      (book?.audiobook?.manifest as ManifestLike | null) ?? null,
  })

  return Response.json(view)
})

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
