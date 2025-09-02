"use client"

import { Stack, Text, Title } from "@mantine/core"
import { IconBooks } from "@tabler/icons-react"

import { useListCollectionsQuery } from "@/store/api"
import { type UUID } from "@/uuid"

import { BookList } from "../books/BookList"

import { CollectionSettings } from "./CollectionSettings"

interface Props {
  collectionUuid: UUID | null
}

export function CollectionDetails({ collectionUuid }: Props) {
  const { collection } = useListCollectionsQuery(undefined, {
    selectFromResult: (result) => ({
      collection: result.data?.find(
        (collection) => collection.uuid === collectionUuid,
      ),
    }),
  })

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
      <BookList collectionUuid={collection?.uuid ?? null} />
    </Stack>
  )
}
