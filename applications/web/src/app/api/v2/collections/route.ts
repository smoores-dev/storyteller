import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { createCollection, getCollections } from "@/database/collections"
import { isUniqueConstraintError } from "@/database/errors"
import { type UUID } from "@/uuid"

/**
 * @summary List all collections
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (request) => {
  const user = request.auth.user
  const { searchParams } = new URL(request.url)
  const order = searchParams.get("order") === "desc" ? "desc" : "asc"
  const limit = searchParams.get("limit")
  const collections = await getCollections(user.id, {
    order,
    ...(limit && { limit: Number(limit) }),
  })

  return NextResponse.json(collections)
})

export const POST = withHasPermission("collectionCreate")(async (request) => {
  const { users, ...values } = (await request.json()) as {
    name: string
    description: string
    public: boolean
    users?: UUID[]
  }

  let created
  try {
    created = await createCollection(values, {
      users: [...(users ?? []), request.auth.user.id],
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { message: `A collection named "${values.name}" already exists` },
        { status: 409 },
      )
    }
    throw error
  }

  return NextResponse.json(created)
})
