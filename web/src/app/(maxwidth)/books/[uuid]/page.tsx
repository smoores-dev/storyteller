import { BookDetail } from "@/components/books/BookDetail"
import { UUID } from "@/uuid"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { BookDetail as Book } from "@/apiModels"

type Props = {
  params: Promise<{
    uuid: UUID
  }>
}

export default async function BookEditPage(props: Props) {
  const params = await props.params

  const { uuid } = params

  const book = await fetchApiRoute<Book>(`/books/${uuid}`)

  return <BookDetail book={book} />
}
