import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { JobActionRequestSchemaV2 } from "@/schemas/v2/job"
import type { UUID } from "@/uuid"
import { cancelJob, pauseJob, resumeJob } from "@/work/distributor"

export const dynamic = "force-dynamic"

type Params = Promise<{ jobId: string }>

/**
 * @summary Pause or resume a job
 * @desc Body `{ action: "pause" | "resume" }`. Pausing a running job aborts it and
 *       keeps its stage; resuming requeues it from the last completed stage.
 * @body JobActionRequestSchemaV2
 */
export const PATCH = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { jobId } = await context.params
  const body: unknown = await request.json().catch(() => null)
  const parsed = JobActionRequestSchemaV2.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  if (parsed.data.action === "pause") await pauseJob(jobId as UUID)
  else await resumeJob(jobId as UUID)

  return new Response(null, { status: 204 })
})

/**
 * @summary Cancel a job
 * @desc Works whether the job is queued or actively running.
 */
export const DELETE = withHasPermission<Params>("bookProcess")(async (
  _request,
  context,
) => {
  const { jobId } = await context.params
  await cancelJob(jobId as UUID)
  return new Response(null, { status: 204 })
})
