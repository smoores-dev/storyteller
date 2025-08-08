import { deleteCachedCoverImages } from "@/assets/fs"
import { withHasPermission } from "@/auth/auth"
import {
  BookRelationsUpdate,
  BookUpdate,
  getBooks,
  updateBook,
} from "@/database/books"
import { UUID } from "@/uuid"

export const POST = withHasPermission("bookCreate")(async (request) => {
  const body = (await request.json()) as {
    update: BookUpdate
    relations: BookRelationsUpdate
    from: UUID[]
  }

  const { update, relations, from } = body

  const books = await getBooks(from, request.auth.user.id)

  if (books.length !== from.length) {
    return Response.json({ message: "Not found" }, { status: 404 })
  }

  if (books.length > 3) {
    return Response.json(
      { message: "Failed to merge books: more than three books specified" },
      { status: 405 },
    )
  }

  if (books.length < 2) {
    return Response.json(
      { message: "Failed to merge books: must specify at least two books" },
      { status: 405 },
    )
  }

  const counts = {
    readaloud: 0,
    ebook: 0,
    audiobook: 0,
  }

  for (const book of books) {
    if (book.ebook) counts.ebook++
    if (book.audiobook) counts.audiobook++
    if (book.readaloud) counts.readaloud++
  }

  if (counts.readaloud > 1 || counts.ebook > 1 || counts.audiobook > 1) {
    return Response.json(
      {
        message:
          "Failed to merge books: more than one of each book format specified",
      },
      { status: 405 },
    )
  }

  const [first, ...toMerge] = books
  const merged = await updateBook(
    // We already checked that the length is greater than one above
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    first!.uuid,
    update,
    {
      ...relations,
      books: toMerge.map((b) => b.uuid),
    },
    request.auth.user.id,
  )

  await deleteCachedCoverImages(merged.uuid)

  return Response.json(merged)
})
