import { BookDetail } from "@/apiModels"
import { UUID } from "@/uuid"
import { Menu, MenuTarget, Button, MenuDropdown, MenuItem } from "@mantine/core"
import { IconCheckbox, IconChevronDown } from "@tabler/icons-react"
import { SetStateAction } from "react"

interface Props {
  books: BookDetail[]
  setSelected: (action: SetStateAction<Set<UUID>>) => void
}

export function SelectMenu({ books, setSelected }: Props) {
  return (
    <Menu shadow="sm">
      <MenuTarget>
        <Button
          variant="light"
          leftSection={<IconCheckbox />}
          rightSection={<IconChevronDown size={16} />}
        >
          Select
        </Button>
      </MenuTarget>

      <MenuDropdown>
        <MenuItem
          onClick={() => {
            setSelected(new Set(books.map((book) => book.uuid)))
          }}
        >
          Select all
        </MenuItem>
        <MenuItem
          onClick={() => {
            setSelected(new Set())
          }}
        >
          Select none
        </MenuItem>
        <MenuItem
          onClick={() => {
            setSelected(
              (prev) =>
                new Set(
                  books
                    .map((book) => book.uuid)
                    .filter((uuid) => !prev.has(uuid)),
                ),
            )
          }}
        >
          Invert selection
        </MenuItem>
      </MenuDropdown>
    </Menu>
  )
}
