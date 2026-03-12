import { Combobox, Group, InputBase, Text, useCombobox } from "@mantine/core"

import { type Status } from "@/database/statuses"
import { type UUID } from "@/uuid"

interface Props {
  disabled?: boolean | undefined
  value?: UUID | undefined
  onChange: (uuid: UUID) => void
  options: Status[]
  className?: string | undefined
}

export function StatusInput({
  value,
  onChange,
  options,
  disabled,
  className,
}: Props) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
    },
  })

  return (
    <Combobox
      {...(className && { className })}
      store={combobox}
      disabled={!!disabled}
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
          classNames={{
            input: "h-10",
          }}
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
