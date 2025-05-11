import { BookList } from "@/components/books/BookList"
import { Stack, Title } from "@mantine/core"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <>
      <Title order={2}>Books</Title>
      <Stack>
        <BookList />
      </Stack>
    </>
  )
}
