import { withHasPermission } from "@/auth/auth"
import {
  addBooksToCollections,
  removeBooksFromCollections,
} from "@/database/collections"
import { UUID } from "@/uuid"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const body = (await request.json()) as {
    collections: UUID[]
    books: UUID[]
  }
  const { collections, books } = body
  await addBooksToCollections(collections, books)

  return new Response(null, { status: 204 })
})

export const DELETE = withHasPermission("bookUpdate")(async (request) => {
  const { collections, books } = (await request.json()) as {
    collections: UUID[]
    books: UUID[]
  }

  await removeBooksFromCollections(collections, books)

  return new Response(null, { status: 204 })
})
