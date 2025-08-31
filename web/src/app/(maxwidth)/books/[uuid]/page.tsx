import { BookDetails } from "@/components/books/BookDetails"
import { UUID } from "@/uuid"
import { fetchApiRoute } from "@/app/fetchApiRoute"

import type { Metadata } from "next"
import { BookWithRelations } from "@/database/books"

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
