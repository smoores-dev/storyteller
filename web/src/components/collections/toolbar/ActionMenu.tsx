import { UUID } from "@/uuid"
import { Menu, MenuTarget, Button, MenuDropdown } from "@mantine/core"
import { IconCheckbox, IconChevronDown } from "@tabler/icons-react"
import { AddBooksToCollectionsItem } from "./actionMenuItems/AddBooksToCollectionsItem"
import { RemoveBooksFromCollectionsItem } from "./actionMenuItems/RemoveBooksFromCollectionsItem"
import { AddBooksToSeriesItem } from "./actionMenuItems/AddBooksToSeriesItem"
import { RemoveBooksFromSeriesItem } from "./actionMenuItems/RemoveBooksFromSeriesItem"
import { MergeBooksItem } from "./actionMenuItems/MergeBooksItem"
import { DeleteBooksItem } from "./actionMenuItems/DeleteBooksItem"
import { AddTagsToBooksItem } from "./actionMenuItems/AddTagsToBooksItem"
import { RemoveTagsFromBooksItem } from "./actionMenuItems/RemoveTagsFromBooksItem"
import { UpdateReadingStatusItem } from "./actionMenuItems/UpdateReadingStatusItem"

interface Props {
  selected: Set<UUID>
  onClear: () => void
}

export function ActionMenu({ selected, onClear }: Props) {
  const disabled = selected.size === 0

  return (
    <>
      <Menu shadow="sm" disabled={disabled} keepMounted>
        <MenuTarget>
          <Button
            variant="light"
            leftSection={<IconCheckbox />}
            rightSection={<IconChevronDown size={16} />}
            disabled={disabled}
          >
            Actions
          </Button>
        </MenuTarget>

        <MenuDropdown>
          <MergeBooksItem selected={selected} />
          <AddBooksToCollectionsItem selected={selected} />
          <RemoveBooksFromCollectionsItem selected={selected} />
          <AddBooksToSeriesItem selected={selected} />
          <RemoveBooksFromSeriesItem selected={selected} />
          <AddTagsToBooksItem selected={selected} />
          <RemoveTagsFromBooksItem selected={selected} />
          <UpdateReadingStatusItem selected={selected} />
          <DeleteBooksItem selected={selected} onCommit={onClear} />
        </MenuDropdown>
      </Menu>
    </>
  )
}
