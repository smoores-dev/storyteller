import { withHasPermission } from "@/auth/auth"
import {
  deleteSeries,
  NewSeriesRelation,
  updateSeries,
} from "@/database/series"
import { UUID } from "@/uuid"

type Params = Promise<{
  uuid: UUID
}>

export const PUT = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { uuid } = await context.params
  const { relations, ...update } = (await request.json()) as {
    name: string
    description: string | null
    relations: NewSeriesRelation[]
  }

  const updated = await updateSeries(uuid, update, { books: relations })
  return Response.json(updated)
})

export const DELETE = withHasPermission<Params>("bookUpdate")(async (
  _request,
  context,
) => {
  const { uuid } = await context.params
  await deleteSeries(uuid)
  return new Response(null, { status: 404 })
})
