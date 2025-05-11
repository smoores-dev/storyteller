import { Status } from "@/database/statuses"
import { UUID } from "@/uuid"
import { Combobox, InputBase, Group, Text, useCombobox } from "@mantine/core"

interface Props {
  value: UUID
  onChange: (uuid: UUID) => void
  options: Status[]
}

export function StatusInput({ value, onChange, options }: Props) {
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
        onChange(value as UUID)
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
            <Text>
              {options.find((s) => s.uuid === value)?.name ?? "Choose status"}
            </Text>
          </Group>
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {options.map((s) => (
            <Combobox.Option value={s.uuid} key={s.uuid}>
              <Group justify="space-between" wrap="nowrap">
                <Text>{s.name}</Text>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
