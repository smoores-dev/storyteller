import { ApiClientError } from "@/apiClient"
import { BookDetail } from "@/apiModels"
import { redirect } from "next/navigation"
import { createAuthedApiClient } from "@/authedApiClient"
import { BookEditForm } from "@/components/books/BookEditForm"
import { logger } from "@/logging"
import { Title } from "@mantine/core"

type Props = {
  params: Promise<{
    uuid: string
  }>
}

export default async function BookEdit(props: Props) {
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
    <>
      <Title order={2}>{book.title}</Title>
      <BookEditForm book={book} />
    </>
  )
}
