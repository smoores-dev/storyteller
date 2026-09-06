import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getDisplayJobs } from "@/database/jobs"
import { JobsReorderRequestSchemaV2 } from "@/schemas/v2/job"
import { reorderJobs } from "@/work/distributor"

import { parseJobsQuery } from "./parseJobsQuery"

export const dynamic = "force-dynamic"

/**
 * @summary List processing jobs
 * @desc Every job by default, or a status set via `type` or `statuses`. Without a sort
 *       the queue comes back in run order. Run config is summarized (no secrets).
 * @query JobsQuerySchemaV2
 * @response JobSchemaV2[]
 */
export const GET = withHasPermission("bookProcess")(async (request) => {
  const parsed = parseJobsQuery(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const jobs = await getDisplayJobs(parsed.query)
  return NextResponse.json(jobs)
})

/**
 * @summary Reorder the queue
 * @desc Body `{ order: jobUuid[] }` covering every active job. Moving a queued job ahead of
 *       the running one sends the running job back to the queue so the new head starts next.
 * @body JobsReorderRequestSchemaV2
 */
export const PATCH = withHasPermission("bookProcess")(async (request) => {
  const body: unknown = await request.json().catch(() => null)
  const parsed = JobsReorderRequestSchemaV2.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  await reorderJobs(parsed.data.order)
  return new Response(null, { status: 204 })
})
