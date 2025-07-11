import { UUID } from "@/uuid"
import { Menu, MenuTarget, Button, MenuDropdown } from "@mantine/core"
import { IconCheckbox, IconChevronDown } from "@tabler/icons-react"
import { AddBooksToCollectionsItem } from "./actionMenuItems/AddBooksToCollectionsItem"
import { RemoveBooksFromCollectionsItem } from "./actionMenuItems/RemoveBooksFromCollectionsItem"
import { AddBooksToSeriesItem } from "./actionMenuItems/AddBooksToSeriesItem"
import { RemoveBooksFromSeriesItem } from "./actionMenuItems/RemoveBooksFromSeriesItem"

interface Props {
  selected: Set<UUID>
}

export function ActionMenu({ selected }: Props) {
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
          <AddBooksToCollectionsItem selected={selected} />
          <RemoveBooksFromCollectionsItem selected={selected} />
          <AddBooksToSeriesItem selected={selected} />
          <RemoveBooksFromSeriesItem selected={selected} />
        </MenuDropdown>
      </Menu>
    </>
  )
}
