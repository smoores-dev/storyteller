import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import {
  ACTIVE_JOB_STATUSES,
  type JobSort,
  TERMINAL_JOB_STATUSES,
  getDisplayJobs,
} from "@/database/jobs"
import type { UUID } from "@/uuid"
import { reorderJobs } from "@/work/distributor"

export const dynamic = "force-dynamic"

/**
 * @summary List processing jobs
 * @desc Active (queued/running/paused) jobs by default; pass `all=true` for history.
 *       Run config is summarized (no secrets) before returning.
 */
export const GET = withHasPermission("bookProcess")(async (request) => {
  const params = request.nextUrl.searchParams
  const type = params.get("type")
  const limit = params.get("limit")
  const offset = params.get("offset")
  const search = params.get("search")
  const sort = params.get("sort")
  const order = params.get("order")
  const bookUuid = params.get("bookUuid")
  const jobs = await getDisplayJobs({
    ...(type
      ? {
          statuses:
            type === "active"
              ? ACTIVE_JOB_STATUSES
              : type === "finished"
                ? TERMINAL_JOB_STATUSES
                : undefined,
        }
      : {}),
    ...(bookUuid ? { bookUuid: bookUuid as UUID } : {}),
    ...(search ? { search } : {}),
    ...(sort ? { sort: sort as JobSort } : {}),
    ...(order === "asc" || order === "desc" ? { order } : {}),
    ...(limit ? { limit: parseInt(limit) } : {}),
    ...(offset ? { offset: parseInt(offset) } : {}),
  })
  return NextResponse.json(jobs)
})

/**
 * @summary Reorder the queue
 * @desc Body `{ order: jobUuid[] }` covering every active job. Moving a queued job ahead of
 *       the running one sends the running job back to the queue so the new head starts next.
 */
export const PATCH = withHasPermission("bookProcess")(async (request) => {
  const body = (await request.json().catch(() => ({}))) as {
    order?: string[]
  }
  if (body.order) await reorderJobs(body.order as UUID[])
  return new Response(null, { status: 204 })
})
