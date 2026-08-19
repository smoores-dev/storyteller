import { withHasPermission } from "@/auth/auth"
import {
  deleteStatus,
  setLibraryDefaultStatus,
  updateStatusLabel,
} from "@/database/statuses"
import { type UUID } from "@/uuid"

type Params = Promise<{ uuid: UUID }>

export const PUT = withHasPermission<Params>("bookUpdate")(async (
  request,
  context,
) => {
  const { uuid } = await context.params

  const body = (await request.json()) as {
    label?: string
    isDefault?: boolean
  }

  if (body.label !== undefined) {
    await updateStatusLabel(uuid, body.label)
  }

  if (body.isDefault !== undefined) {
    await setLibraryDefaultStatus(body.isDefault ? uuid : null)
  }

  return new Response(null, { status: 204 })
})

export const DELETE = withHasPermission<Params>("settingsUpdate")(async (
  _request,
  context,
) => {
  const { uuid } = await context.params

  await deleteStatus(uuid)

  return new Response(null, { status: 204 })
})
