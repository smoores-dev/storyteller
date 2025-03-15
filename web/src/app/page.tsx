import { BookList } from "@/components/books/BookList"
import { redirect } from "next/navigation"
import { ApiClientError } from "@/apiClient"
import { BookDetail } from "@/apiModels"
import { createAuthedApiClient } from "@/authedApiClient"
import { logger } from "@/logging"
import { Alert, Stack, Title, Text } from "@mantine/core"
import { IconInfoCircle } from "@tabler/icons-react"
import Link from "next/link"

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
      <Alert
        className="my-4"
        variant="light"
        title="Storyteller has moved!"
        color="st-orange"
        icon={<IconInfoCircle />}
      >
        <Text>
          The GitLab repository has moved to{" "}
          <Link
            className="text-st-orange font-bold"
            href="https://gitlab.com/storyteller-platform/storyteller"
          >
            https://gitlab.com/storyteller-platform/storyteller
          </Link>
          , which means that the container registry is now at{" "}
          <Text className="text-st-orange inline font-bold">
            registry.gitlab.com/storyteller-platform/storyteller
          </Text>
          .
        </Text>
        <Title order={3} className="my-4">
          What do you need to do?
        </Title>
        <Text className="my-2">
          Update your docker compose files and Unraid container templates!
        </Text>
        <Text>
          Nothing will stop working — the old repository and registry still
          exist. But new versions will only be published to the new container
          registry.
        </Text>
      </Alert>
      <Stack>
        <BookList books={books} />
      </Stack>
    </>
  )
}
