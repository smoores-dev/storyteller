import { withHasPermission } from "@/auth/auth"
import { addTagsToBooks, removeTagsFromBooks } from "@/database/tags"
import { UUID } from "@/uuid"
import { queueWritesToFiles } from "@/writeToFiles/fileWriteDistributor"

export const POST = withHasPermission("bookUpdate")(async (request) => {
  const body = (await request.json()) as {
    tags: string[]
    books: UUID[]
  }
  const { tags, books } = body
  await addTagsToBooks(books, tags)

  for (const book of books) {
    void queueWritesToFiles(book)
  }

  return new Response(null, { status: 204 })
})

export const DELETE = withHasPermission("bookUpdate")(async (request) => {
  const body = (await request.json()) as {
    tags: UUID[]
    books: UUID[]
  }
  const { tags, books } = body
  await removeTagsFromBooks(books, tags)

  return new Response(null, { status: 204 })
})
