import { UUID } from "@/uuid"
import { Group, Button } from "@mantine/core"
import { IconEditOff, IconEdit } from "@tabler/icons-react"
import { SetStateAction } from "react"
import { SelectMenu } from "./SelectMenu"
import { ActionMenu } from "./ActionMenu"
import { Collection } from "@/database/collections"
import { AddBooksMenu } from "@/components/books/AddBooksMenu"
import { BookWithRelations } from "@/database/books"

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
  return (
    <Group>
      <Button
        variant="light"
        className="self-start"
        leftSection={isEditing ? <IconEditOff /> : <IconEdit />}
        onClick={() => {
          setIsEditing((value) => !value)
          setSelected(new Set())
        }}
      >
        {isEditing ? "Done" : "Edit"}
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
      <AddBooksMenu collection={collection} />
    </Group>
  )
}
