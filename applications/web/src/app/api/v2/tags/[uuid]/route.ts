import { withHasPermission } from "@/auth/auth"
import { deleteTag, updateTag } from "@/database/tags"
import { type UUID } from "@/uuid"

type Params = Promise<{ uuid: UUID }>

export const PUT = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { uuid } = await context.params
  const { name, icon, color } = (await request.json()) as {
    name?: string
    icon?: string | null
    color?: string | null
  }

  const updated = await updateTag(uuid, { name, icon, color })
  return Response.json(updated)
})

export const DELETE = withHasPermission<Params>("bookUpdate")(async (
  _request,
  context,
) => {
  const { uuid } = await context.params
  await deleteTag(uuid)
  return new Response(null, { status: 204 })
})
