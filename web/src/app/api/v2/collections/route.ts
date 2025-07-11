import { withHasPermission } from "@/auth/auth"
import { createCollection, getCollections } from "@/database/collections"
import { UUID } from "@/uuid"
import { NextResponse } from "next/server"

/**
 * @summary List all collections
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user
  const collections = await getCollections(user.id)

  return NextResponse.json(collections)
})

export const POST = withHasPermission("collectionCreate")(async (request) => {
  const { users, ...values } = (await request.json()) as {
    name: string
    description: string
    public: boolean
    users?: UUID[]
  }

  const created = await createCollection(values, {
    users: [...(users ?? []), request.auth.user.id],
  })

  return NextResponse.json(created)
})
