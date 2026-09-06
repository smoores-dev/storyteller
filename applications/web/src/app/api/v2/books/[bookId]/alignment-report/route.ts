import {
  type ManifestLike,
  type ReportJob,
  buildReportView,
} from "@/alignmentReportView"
import { withHasPermission } from "@/auth/auth"
import {
  type AlignmentOverrides,
  getAlignmentReportForBook,
  updateAlignmentOverrides,
} from "@/database/alignmentReports"
import { getBook } from "@/database/books"
import { type Job, getJob } from "@/database/jobs"
import type { UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ bookId: string }>

function reportJob(job: Job | null): ReportJob | null {
  if (!job) return null
  const runSeconds = job.stats?.totalWallMs
    ? job.stats.totalWallMs / 1000
    : job.startedAt && job.finishedAt
      ? (new Date(job.finishedAt).getTime() -
          new Date(job.startedAt).getTime()) /
        1000
      : null
  return {
    uuid: job.uuid,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    runSeconds,
    config: job.config
      ? {
          aligner: job.config.aligner,
          ctcEngine: job.config.ctcEngine,
          transcriptionEngine: job.config.transcriptionEngine,
          whisperModel: job.config.whisperModel,
          language: job.config.language,
        }
      : null,
  }
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
  const job = report?.jobUuid ? await getJob(report.jobUuid) : null

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

  const view = buildReportView({
    report: report.report,
    bookUuid,
    bookTitle: book.title,
    reportUuid: report.uuid,
    jobUuid: report.jobUuid,
    job: reportJob(job),
    createdAt: report.createdAt,
    overrides,
    ebookManifest: (book.ebook?.manifest as ManifestLike | null) ?? null,
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
