import { BookList } from "@/components/books/BookList"
import { Title } from "@mantine/core"
import { assertHasPermission } from "@/auth/auth"

export const dynamic = "force-dynamic"

export default async function Books() {
  await assertHasPermission("bookList")

  return (
    <>
      <Title order={2}>Books</Title>
      <BookList />
    </>
  )
}
