import { type Metadata } from "next"
import { notFound } from "next/navigation"

import { withPageAuth } from "@v3/_/server/page-auth-wrapper"

import { getBook } from "@/database/books"
import { ASSETS_DIR } from "@/directories"
import { type UUID } from "@/uuid"

import { BookPageClient } from "./BookPageClient"

export type BookDetailsPageProps = {
  params: Promise<{
    uuid: UUID
  }>
}

export async function generateMetadata({
  params,
}: BookDetailsPageProps): Promise<Metadata> {
  const { uuid } = await params
  const book = await getBook(uuid)
  return {
    title: book?.title ?? "Book not found",
  }
}

export default withPageAuth<BookDetailsPageProps>(["bookRead"])(
  async function BookDetailsPage({ params }, user) {
    const { uuid } = await params

    const book = await getBook(uuid, user.id)

    if (!book) {
      notFound()
    }

    return (
      <BookPageClient uuid={uuid} assetsDir={ASSETS_DIR} initialBook={book} />
    )
  },
)
