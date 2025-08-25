import { BookList } from "@/components/books/BookList"
import { Title } from "@mantine/core"
import { assertHasPermission } from "@/auth/auth"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Books",
}

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
