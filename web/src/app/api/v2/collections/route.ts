import { withHasPermission } from "@/auth"
import { createCollection, getCollections } from "@/database/collections"
import { NextResponse } from "next/server"

/**
 * @summary List all collections
 * @desc '
 */
export const GET = withHasPermission("bookList")(async (
  _request,
  _context,
  _token,
  tokenData,
) => {
  const collections = await getCollections(tokenData.username)

  return NextResponse.json(collections)
})

export const POST = withHasPermission("collectionCreate")(async (request) => {
  const { users, ...values } = (await request.json()) as {
    name: string
    description: string
    public: boolean
    users?: string[]
  }

  const created = await createCollection(values, users && { users })

  return NextResponse.json(created)
})
