import { Stack, Title } from "@mantine/core"
import { type Metadata } from "next"

import { assertHasPermission } from "@/auth/auth"
import { BookShelves } from "@/components/books/BookShelves"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Home | Storyteller",
}

export default async function Home() {
  await assertHasPermission("bookList")

  return (
    <Stack>
      <Title order={2} size="h3">
        Home
      </Title>
      <BookShelves />
    </Stack>
  )
}
