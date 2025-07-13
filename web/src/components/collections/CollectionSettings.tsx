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
  const { isSuccess } = useListCollectionsQuery()
  const [isOpen, setIsOpen] = useState(false)

  if (!isSuccess) return null

  return (
    <>
      <UpdateCollectionModal
        uuid={uuid}
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
