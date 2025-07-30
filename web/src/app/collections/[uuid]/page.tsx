import { BookDetail } from "@/apiModels"
import { fetchApiRoute } from "@/app/fetchApiRoute"
import { BookList } from "@/components/books/BookList"
import { CollectionSettings } from "@/components/collections/CollectionSettings"
import { Collection } from "@/database/collections"
import { UUID } from "@/uuid"
import { Title, Stack, Text } from "@mantine/core"
import { IconBooks } from "@tabler/icons-react"

interface Props {
  params: Promise<{ uuid: UUID | "none" }>
}

export default async function CollectionPage({ params }: Props) {
  const { uuid } = await params

  const collection =
    uuid === "none"
      ? null
      : await fetchApiRoute<Collection>(`/collections/${uuid}`)
  const books = await fetchApiRoute<BookDetail[]>("/books")

  return (
    <Stack gap={24}>
      <Title order={2} className="flex items-center gap-2 px-2 py-2">
        <IconBooks size={30} /> {collection?.name ?? "Uncollected"}{" "}
        {collection && <CollectionSettings uuid={collection.uuid} />}
      </Title>
      <Text>
        {collection
          ? collection.description
          : "Books that have not yet been added to any collections."}
      </Text>
      <BookList collectionUuid={collection?.uuid ?? null} books={books} />
    </Stack>
  )
}
