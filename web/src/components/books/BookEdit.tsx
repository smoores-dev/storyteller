import { createAuthedApiClient } from "@/authedApiClient"
import { BookEditForm } from "./edit/BookEditForm"
import { UUID } from "@/uuid"

interface Props {
  bookUuid: UUID
}

export async function BookEdit({ bookUuid }: Props) {
  const client = await createAuthedApiClient()
  const statuses = await client.listStatuses()
  const authors = await client.listAuthors()
  const series = await client.listSeries()
  const collections = await client.listCollections()
  const users = await client.listUsers()
  const tags = await client.listTags()

  return (
    <BookEditForm
      bookUuid={bookUuid}
      statuses={statuses}
      authors={authors}
      series={series}
      collections={collections}
      users={users}
      tags={tags}
    />
  )
}
