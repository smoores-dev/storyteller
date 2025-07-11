import { ApiClientError } from "@/apiClient"
import { BookDetail } from "@/apiModels"
import { redirect } from "next/navigation"
import { createAuthedApiClient } from "@/authedApiClient"
import { logger } from "@/logging"
import { Stack, Text, Title } from "@mantine/core"
import { BookStatus } from "@/components/books/BookStatus"
import { BookEditForm } from "@/components/books/edit/BookEditForm"

type Props = {
  params: Promise<{
    uuid: string
  }>
}

export default async function BookEditPage(props: Props) {
  const params = await props.params

  const { uuid } = params

  const client = await createAuthedApiClient()

  let book: BookDetail | null = null

  try {
    book = await client.getBookDetails(uuid)
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
    <Stack gap={24}>
      <Title order={2}>{book.title}</Title>
      <BookStatus bookUuid={book.uuid} />
      {(book.alignedAt ||
        book.alignedWith ||
        book.alignedByStorytellerVersion) && (
        <Stack className="rounded bg-gray-100 p-4">
          {book.alignedAt && (
            <Text>
              <span className="font-bold">Last aligned:</span>{" "}
              {new Date(book.alignedAt).toLocaleString()}
            </Text>
          )}
          {book.alignedWith && (
            <Text>
              <span className="font-bold">Transcription engine:</span>{" "}
              {book.alignedWith}
            </Text>
          )}
          {book.alignedByStorytellerVersion && (
            <Text>
              <span className="font-bold">
                Storyteller version used to align:
              </span>{" "}
              {book.alignedByStorytellerVersion}
            </Text>
          )}
        </Stack>
      )}
      <BookEditForm bookUuid={book.uuid} />
    </Stack>
  )
}
