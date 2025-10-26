import { Button, Group } from "@mantine/core"
import { IconEdit, IconEditOff } from "@tabler/icons-react"
import { type SetStateAction } from "react"

import { AddBooksMenu } from "@/components/books/AddBooksMenu"
import { type BookWithRelations } from "@/database/books"
import { type Collection } from "@/database/collections"
import { usePermissions } from "@/hooks/usePermissions"
import { type UUID } from "@/uuid"

import { ActionMenu } from "./ActionMenu"
import { SelectMenu } from "./SelectMenu"

interface Props {
  collection?: Collection | undefined
  books: BookWithRelations[]
  selected: Set<UUID>
  setSelected: (action: SetStateAction<Set<UUID>>) => void
  isEditing: boolean
  setIsEditing: (action: SetStateAction<boolean>) => void
}

export function CollectionToolbar({
  collection,
  books,
  selected,
  setSelected,
  isEditing,
  setIsEditing,
}: Props) {
  const permissions = usePermissions()

  if (
    !permissions?.bookCreate &&
    !permissions?.bookUpdate &&
    !permissions?.bookProcess &&
    !permissions?.bookDownload
  ) {
    return null
  }

  return (
    <Group className="w-max flex-nowrap gap-2 [&>*]:shrink-0">
      <Button
        variant="light"
        className={`w-fit self-start ${isEditing ? "!pr-1" : ""}`}
        leftSection={isEditing ? <IconEditOff /> : <IconEdit />}
        onClick={() => {
          setIsEditing((value) => !value)
          setSelected(new Set())
        }}
      >
        {isEditing ? <span className="sr-only">Done</span> : "Edit"}
      </Button>
      {isEditing && (
        <>
          <SelectMenu books={books} setSelected={setSelected} />
          <ActionMenu
            selected={selected}
            onClear={() => {
              setSelected(new Set())
            }}
          />
        </>
      )}
      {permissions.bookCreate && <AddBooksMenu collection={collection} />}
    </Group>
  )
}
