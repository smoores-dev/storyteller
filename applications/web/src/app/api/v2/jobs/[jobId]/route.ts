import { withHasPermission } from "@/auth/auth"
import type { UUID } from "@/uuid"
import { cancelJob, pauseJob, resumeJob } from "@/work/distributor"

export const dynamic = "force-dynamic"

type Params = Promise<{ jobId: string }>

/**
 * @summary Pause or resume a job
 * @desc Body `{ action: "pause" | "resume" }`. Pausing a running job aborts it and
 *       keeps its stage; resuming requeues it from the last completed stage.
 */
export const PATCH = withHasPermission<Params>("bookProcess")(async (
  request,
  context,
) => {
  const { jobId } = await context.params
  const body = (await request.json().catch(() => ({}))) as {
    action?: "pause" | "resume"
  }

  if (body.action === "pause") await pauseJob(jobId as UUID)
  else if (body.action === "resume") await resumeJob(jobId as UUID)

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
