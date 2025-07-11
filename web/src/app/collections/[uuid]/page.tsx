import { ApiClientError } from "@/apiClient"
import { createAuthedApiClient } from "@/authedApiClient"
import { BookList } from "@/components/books/BookList"
import { Collection } from "@/database/collections"
import { logger } from "@/logging"
import { UUID } from "@/uuid"
import { Title, Stack, Text } from "@mantine/core"
import { IconBooks } from "@tabler/icons-react"
import { redirect } from "next/navigation"

interface Props {
  params: Promise<{ uuid: UUID | "none" }>
}

export default async function CollectionPage({ params }: Props) {
  const { uuid } = await params

  const client = await createAuthedApiClient()

  let collection: Collection | null = null

  try {
    if (uuid !== "none") {
      collection = await client.getCollection(uuid)
    }
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
      <Title order={2} className="flex items-center gap-2 px-2 py-2">
        <IconBooks size={30} /> {collection?.name ?? "Uncollected"}
      </Title>
      <Text>
        {collection
          ? collection.description
          : "Books that have not yet been added to any collections."}
      </Text>
      <BookList collectionUuid={collection?.uuid ?? null} />
    </Stack>
  )
}
