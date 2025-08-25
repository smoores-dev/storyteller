import { BookDetails } from "@/components/books/BookDetails"
import { UUID } from "@/uuid"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { BookDetail } from "@/apiModels"
import type { Metadata } from "next"

type Props = {
  params: Promise<{
    uuid: UUID
  }>
}

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { uuid } = await params
  const book = await fetchApiRoute<BookDetail>(`/books/${uuid}`)
  return {
    title: `${book.title} | Books`,
  }
}

export default async function BookEditPage(props: Props) {
  const params = await props.params

  const { uuid } = params
  await fetchApiRoute<BookDetail>(`/books/${uuid}`)

  return <BookDetails bookUuid={uuid} />
}
