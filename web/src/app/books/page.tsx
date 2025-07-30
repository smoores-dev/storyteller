import { BookList } from "@/components/books/BookList"
import { Title } from "@mantine/core"
import { fetchApiRoute } from "../fetchApiRoute"
import { BookDetail } from "@/apiModels"

export const dynamic = "force-dynamic"

export default async function Books() {
  const books = await fetchApiRoute<BookDetail[]>("/books")
  return (
    <>
      <Title order={2}>Books</Title>
      <BookList books={books} />
    </>
  )
}
