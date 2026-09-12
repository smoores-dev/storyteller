import {
  type AlignmentOverrides,
  type ManifestLike,
  type ReportJob,
  buildReportView,
} from "@/alignmentReportView"
import { withHasPermission } from "@/auth/auth"
import {
  getAlignmentReportForBook,
  listAlignmentReportSummaries,
  updateAlignmentOverrides,
} from "@/database/alignmentReports"
import { getBook } from "@/database/books"
import { type Job, getJob } from "@/database/jobs"
import type { UUID } from "@/uuid"
import { summarizeRunConfig } from "@/work/runConfig"

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
    config: summarizeRunConfig(job.config),
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
  const reportUuid = request.nextUrl.searchParams.get("reportUuid") as
    | UUID
    | undefined

  const [report, book, history] = await Promise.all([
    getAlignmentReportForBook(bookUuid, reportUuid),
    getBook(bookUuid, request.auth.user.id),
    listAlignmentReportSummaries(bookUuid),
  ])
  const index = history.findIndex((row) => row.uuid === report?.uuid)
  const previousRow = index >= 0 ? history[index + 1] ?? null : null
  const [job, previousJob] = await Promise.all([
    report?.jobUuid ? getJob(report.jobUuid) : null,
    previousRow?.jobUuid ? getJob(previousRow.jobUuid) : null,
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

  const view = buildReportView({
    report: report.report,
    bookUuid,
    bookTitle: book.title,
    reportUuid: report.uuid,
    jobUuid: report.jobUuid,
    job: reportJob(job),
    createdAt: report.createdAt,
    latest: index === 0,
    previous: previousRow
      ? {
          reportUuid: previousRow.uuid,
          createdAt: previousRow.createdAt,
          hasReport: previousRow.hasReport === 1,
          job: reportJob(previousJob),
          grade: previousRow.grade,
          score: previousRow.score,
          confidence: previousRow.confidence,
          sentenceCoverage: previousRow.sentenceCoverage,
          audioCoverage: previousRow.audioCoverage,
          chapters: previousRow.chapters,
          failedChapters: previousRow.failedChapters,
          unalignedAudio: previousRow.unalignedAudio,
        }
      : null,
    overrides,
    ebookManifest: (book.ebook?.manifest as ManifestLike | null) ?? null,
    audiobookDuration: book.audiobook?.duration ?? null,
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
