import { type Metadata } from "next"

import { fetchApiRoute } from "@/app/fetchApiRoute"
import { BookDetails } from "@/components/books/BookDetails"
import { type BookWithRelations } from "@/database/books"
import { type UUID } from "@/uuid"

type Props = {
  params: Promise<{
    uuid: UUID
  }>
}

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { uuid } = await params
  const book = await fetchApiRoute<BookWithRelations>(`/books/${uuid}`)
  return {
    title: `${book.title} | Books`,
  }
}

export default async function BookEditPage(props: Props) {
  const params = await props.params

  const { uuid } = params
  await fetchApiRoute<BookWithRelations>(`/books/${uuid}`)

  return <BookDetails bookUuid={uuid} />
}
