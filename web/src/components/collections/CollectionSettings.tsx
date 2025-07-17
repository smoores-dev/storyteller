"use client"
import { UUID } from "@/uuid"
import { UpdateCollectionModal } from "./UpdateCollectionModal"
import { ActionIcon } from "@mantine/core"
import { IconSettings } from "@tabler/icons-react"
import { useState } from "react"
import { useListCollectionsQuery } from "@/store/api"

interface Props {
  uuid: UUID
}

export function CollectionSettings({ uuid }: Props) {
  const { collection } = useListCollectionsQuery(undefined, {
    selectFromResult: (result) => ({
      collection: result.data?.find((collection) => collection.uuid === uuid),
    }),
  })
  const [isOpen, setIsOpen] = useState(false)

  if (!collection) return null

  return (
    <>
      <UpdateCollectionModal
        collection={collection}
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false)
        }}
      />
      <ActionIcon
        variant="subtle"
        onClick={() => {
          setIsOpen(true)
        }}
      >
        <IconSettings />
      </ActionIcon>
    </>
  )
}
