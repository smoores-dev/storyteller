import { BookSort, BookSortKey } from "@/hooks/useFilterSortedBooks"
import { useCombobox, Combobox, InputBase, Group, Text } from "@mantine/core"
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react"
import { Dispatch, SetStateAction } from "react"

const optionLabels: Record<BookSortKey, string> = {
  title: "Title",
  author: "Author name",
  "align-time": "Last aligned",
  "create-time": "Created",
}

interface Props {
  value: BookSort
  onValueChange: Dispatch<SetStateAction<BookSort>>
}

export function Sort({ value, onValueChange }: Props) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
    },
  })

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(value) => {
        onValueChange((prev) => {
          if (prev[0] === value) {
            return [value, prev[1] === "asc" ? "desc" : "asc"]
          }
          return [value as BookSortKey, "asc"]
        })
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target>
        <InputBase
          className="w-48"
          component="button"
          type="button"
          pointer
          rightSection={<Combobox.Chevron />}
          onClick={() => {
            combobox.toggleDropdown()
          }}
          rightSectionPointerEvents="none"
        >
          <Group justify="space-between" wrap="nowrap">
            <Text>{optionLabels[value[0]]}</Text>
            {value[1] === "asc" ? (
              <IconArrowDown size={16} />
            ) : (
              <IconArrowUp size={16} />
            )}
          </Group>
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {Object.entries(optionLabels).map(([option, label]) => (
            <Combobox.Option value={option} key={option}>
              <Group justify="space-between" wrap="nowrap">
                <Text>{label}</Text>
                {value[0] === option ? (
                  value[1] === "asc" ? (
                    <IconArrowDown size={16} />
                  ) : (
                    <IconArrowUp size={16} />
                  )
                ) : null}
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
