"use client"

import { Text, Title } from "@mantine/core"
import { IconBooks } from "@tabler/icons-react"

import { BookList } from "@/components/books/BookList"
import { useListCollectionsQuery } from "@/store/api"
import { type UUID } from "@/uuid"

import { CollectionSettings } from "./CollectionSettings"

interface Props {
  collectionUuid: UUID | null
  name: string | null
  description: string | null
}

export function CollectionDetails({
  name: initialName,
  description: initialDescription,
  collectionUuid,
}: Props) {
  const { collection } = useListCollectionsQuery(undefined, {
    selectFromResult: (result) => ({
      collection: result.data?.find(
        (collection) => collection.uuid === collectionUuid,
      ),
    }),
  })

  const description = collectionUuid
    ? collection?.description ?? initialDescription
    : "Books that have not yet been added to any collections."

  return (
    <>
      <Title order={2} size="h3" className="flex items-center gap-2">
        <IconBooks size={30} />{" "}
        {collection?.name ?? initialName ?? "Uncollected"}{" "}
        {collection && <CollectionSettings uuid={collection.uuid} />}
      </Title>
      {(!collection || description) && <Text>{description}</Text>}
      <BookList collectionUuid={collection?.uuid ?? null} />
    </>
  )
}
