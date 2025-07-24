import { ActionIcon, TextInput } from "@mantine/core"
import { IconX } from "@tabler/icons-react"
import { startTransition, useRef } from "react"

interface Props {
  onValueChange: (value: string) => void
}

export function Search({ onValueChange }: Props) {
  const ref = useRef<HTMLInputElement | null>(null)

  return (
    <TextInput
      ref={ref}
      placeholder="Search"
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
