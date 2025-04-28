import { ActionIcon, TextInput } from "@mantine/core"
import { IconX } from "@tabler/icons-react"
import { startTransition, useRef } from "react"

interface Props {
  value: string
  onValueChange: (value: string) => void
}

export function Search({ value, onValueChange }: Props) {
  const ref = useRef<HTMLInputElement | null>(null)

  return (
    <TextInput
      ref={ref}
      placeholder="Search"
      value={value}
      rightSection={
        <ActionIcon
          variant="subtle"
          onClick={() => {
            ref.current?.focus()
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
