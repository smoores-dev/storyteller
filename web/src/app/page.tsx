import { BookList } from "@/components/books/BookList"
import { redirect } from "next/navigation"
import { ApiClientError } from "@/apiClient"
import { BookDetail } from "@/apiModels"
import { createAuthedApiClient } from "@/authedApiClient"
import { logger } from "@/logging"
import { Stack, Title } from "@mantine/core"

export const dynamic = "force-dynamic"

export default async function Home() {
  const client = await createAuthedApiClient()

  let books: BookDetail[] = []

  try {
    books = await client.listBooks()
  } catch (e) {
    if (e instanceof ApiClientError && e.statusCode === 401) {
      return redirect("/login")
    }

    if (e instanceof ApiClientError && e.statusCode === 403) {
      return (
        <>
          <Title order={2}>Forbidden</Title>
          <p>You don&apos;t have permission to see this page</p>
        </>
      )
    }

    logger.error(e)

    return (
      <>
        <Title order={2}>API is down</Title>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </>
    )
  }

  return (
    <>
      <Title order={2}>Books</Title>
      <Stack>
        <BookList books={books} />
      </Stack>
    </>
  )
}
