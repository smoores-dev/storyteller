import { ApiClientError } from "@/apiClient"
import { notFound, redirect } from "next/navigation"
import { createAuthedApiClient } from "@/authedApiClient"
import { logger } from "@/logging"
import { Title } from "@mantine/core"
import { BookDetail } from "@/components/books/BookDetail"
import { UUID } from "@/uuid"

type Props = {
  params: Promise<{
    uuid: UUID
  }>
}

export default async function BookEditPage(props: Props) {
  const params = await props.params

  const { uuid } = params

  const client = await createAuthedApiClient()

  try {
    await client.getBookDetails(uuid)
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

    if (e instanceof ApiClientError && e.statusCode === 404) {
      notFound()
    }

    logger.error(e)

    return (
      <>
        <Title order={2}>API is down</Title>
        <p>Storyteller couldn&apos;t connect to the Storyteller API</p>
      </>
    )
  }

  return <BookDetail bookUuid={uuid} />
}
