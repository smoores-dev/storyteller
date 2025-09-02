import { ActionIcon, TextInput, TextInputProps } from "@mantine/core"
import { IconX } from "@tabler/icons-react"
import { startTransition, useRef } from "react"

interface Props {
  value?: string
  onValueChange: (value: string) => void
  classNames?: TextInputProps["classNames"]
}

export function Search({
  onValueChange,
  value: initialValue,
  classNames,
}: Props) {
  const ref = useRef<HTMLInputElement | null>(null)

  return (
    <TextInput
      ref={ref}
      placeholder="Search"
      className="my-0"
      defaultValue={initialValue}
      classNames={{ ...classNames }}
      rightSection={
        <ActionIcon
          variant="subtle"
          onClick={() => {
            if (ref.current) {
              ref.current.focus()
              ref.current.value = ""
            }
            startTransition(() => {
              onValueChange("")
            })
          }}
        >
          <IconX />
        </ActionIcon>
      }
      onChange={(event) => {
        startTransition(() => {
          const value = event.currentTarget.value
          onValueChange(value)
        })
      }}
    />
  )
}
