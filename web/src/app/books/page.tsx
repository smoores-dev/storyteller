import { BookList } from "@/components/books/BookList"
import { Title } from "@mantine/core"

export const dynamic = "force-dynamic"

export default function Books() {
  return (
    <>
      <Title order={2}>Books</Title>
      <BookList />
    </>
  )
}
