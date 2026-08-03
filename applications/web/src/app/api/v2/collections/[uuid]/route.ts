import { withHasPermission } from "@/auth/auth"
import {
  deleteCollection,
  getCollection,
  updateCollection,
} from "@/database/collections"
import { isUniqueConstraintError } from "@/database/errors"
import { type UUID } from "@/uuid"

export const dynamic = "force-dynamic"

type Params = Promise<{ uuid: UUID }>

/**
 * @summary Get details for a collection
 * @description '
 */
export const GET = withHasPermission<Params>("bookList")(async (
  request,
  context,
) => {
  const user = request.auth.user
  const { uuid } = await context.params
  const collection = await getCollection(uuid, user.id)

  return Response.json(collection)
})

/**
 * @summary Update details for a collection
 * @description '
 */
export const PUT = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const user = request.auth.user
  const { uuid } = await context.params
  const { users, ...values } = (await request.json()) as {
    name?: string
    description?: string
    public?: boolean
    users?: UUID[]
    icon?: string | null
    color?: string | null
  }

  try {
    const updated = await updateCollection(uuid, values, {
      users: [...(users ?? []), user.id],
    })

    return Response.json(updated)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return Response.json(
        { message: `A collection named "${values.name}" already exists` },
        { status: 409 },
      )
    }
    throw error
  }
})

export const DELETE = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const user = request.auth.user
  const { uuid } = await context.params

  await deleteCollection(uuid, user.id)

  return new Response(null, { status: 204 })
})
