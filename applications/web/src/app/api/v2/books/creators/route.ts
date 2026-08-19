import { withHasPermission } from "@/auth/auth"
import { type Role } from "@/components/books/edit/marcRelators"
import {
  type AddCreatorInput,
  addCreatorsToBooks,
  removeCreatorsFromBooks,
} from "@/database/creators"
import { type UUID } from "@/uuid"
import { queueWritesToFiles } from "@/writeToFiles/fileWriteDistributor"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const body = (await request.json()) as {
    creators: (string | AddCreatorInput)[]
    books: UUID[]
    role: Role
  }
  const { creators, books, role } = body
  const normalized: AddCreatorInput[] = creators.map((c) =>
    typeof c === "string" ? { name: c } : c,
  )
  await addCreatorsToBooks(books, normalized, role)

  for (const book of books) {
    void queueWritesToFiles(book)
  }

  return new Response(null, { status: 204 })
})

export const DELETE = withHasPermission("bookUpdate")(async (request) => {
  const body = (await request.json()) as {
    creators: UUID[]
    books: UUID[]
    role: Role
  }
  const { creators, books, role } = body
  await removeCreatorsFromBooks(books, creators, role)

  for (const book of books) {
    void queueWritesToFiles(book)
  }

  return new Response(null, { status: 204 })
})
