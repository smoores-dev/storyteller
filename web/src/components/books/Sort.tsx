import { Combobox, Group, InputBase, Text, useCombobox } from "@mantine/core"
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react"

import { type BookSort, type BookSortKey } from "@/hooks/useFilterSortedBooks"

const optionLabels: Record<BookSortKey, string> = {
  title: "Title",
  author: "Author",
  "align-time": "Last aligned",
  "create-time": "Created",
  "publish-date": "Published",
  "file-size": "File size",
  "page-count": "Page count",
  duration: "Duration",
}

interface Props {
  value: BookSort
  onValueChange: (values: BookSort) => void
  exclude?: BookSortKey[]
}

export function Sort({ value, onValueChange, exclude }: Props) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
    },
  })

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(submitted) => {
        const sortKey = submitted as BookSortKey
        if (value[0] === sortKey) {
          onValueChange([sortKey, value[1] === "asc" ? "desc" : "asc"])
          return
        }
        onValueChange([
          sortKey,
          [
            "publish-date",
            "create-time",
            "align-time",
            "file-size",
            "page-count",
            "duration",
          ].includes(sortKey)
            ? "desc"
            : "asc",
        ])
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target>
        <InputBase
          className="w-40 whitespace-nowrap md:w-48"
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
            <Text className="whitespace-nowrap">{optionLabels[value[0]]}</Text>
            {value[1] === "asc" ? (
              <IconArrowDown size={16} className="-ml-4" />
            ) : (
              <IconArrowUp size={16} className="-ml-4" />
            )}
          </Group>
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {Object.entries(optionLabels)
            .filter(([option]) => !exclude?.includes(option as BookSortKey))
            .map(([option, label]) => (
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
