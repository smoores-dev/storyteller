import { BookDetails } from "@/components/books/BookDetails"
import { UUID } from "@/uuid"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { BookDetail } from "@/apiModels"

type Props = {
  params: Promise<{
    uuid: UUID
  }>
}

export default async function BookEditPage(props: Props) {
  const params = await props.params

  const { uuid } = params
  await fetchApiRoute<BookDetail>(`/books/${uuid}`)

  return <BookDetails bookUuid={uuid} />
}
