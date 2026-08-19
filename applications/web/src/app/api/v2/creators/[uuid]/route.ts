import { withHasPermission } from "@/auth/auth"
import {
  type CreatorUpdate,
  deleteCreator,
  getCreator,
  updateCreator,
} from "@/database/creators"
import { type UUID } from "@/uuid"

type Params = Promise<{ uuid: UUID }>

export const GET = withHasPermission<Params>("bookList")(async (
  request,
  context,
) => {
  const { uuid } = await context.params
  const creator = await getCreator(uuid, request.auth.user.id)

  if (!creator) {
    return Response.json({ message: "Not found" }, { status: 404 })
  }

  return Response.json(creator)
})

// TODO: maybe add visibility checks for creators here as well
export const PUT = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { uuid } = await context.params
  const update = (await request.json()) as CreatorUpdate

  const updated = await updateCreator(uuid, update)
  return Response.json(updated)
})

// TODO: maybe add visibility checks for creators here as well
export const DELETE = withHasPermission<Params>("bookUpdate")(async (
  _request,
  context,
) => {
  const { uuid } = await context.params
  await deleteCreator(uuid)
  return new Response(null, { status: 204 })
})
