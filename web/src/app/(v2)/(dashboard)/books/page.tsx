import { Title } from "@mantine/core"
import { type Metadata } from "next"

import { assertHasPermission } from "@/auth/auth"
import { BookList } from "@/components/books/BookList"

export const metadata: Metadata = {
  title: "Books",
}

export const dynamic = "force-dynamic"

export default async function Books() {
  await assertHasPermission("bookList")

  // add trailing slash to data dir
  // this is fine, bc if they can see the books page they can basically figure out the data dir anyway

  return (
    <>
      <Title order={2} size="h3">
        Books
      </Title>
      <BookList />
    </>
  )
}
