import { MultiSelect } from "@mantine/core"
import { type UseFormReturnType } from "@mantine/form"

import { type User } from "@/apiModels"
import { type UUID } from "@/uuid"

type InputProps = ReturnType<
  UseFormReturnType<{ users: UUID[] }>["getInputProps"]
>

type Props = InputProps & {
  label: string
  description?: string
  users: User[]
}

export function UserSelect({ users, ...props }: Props) {
  return (
    <MultiSelect
      {...props}
      data={users.map((user) => ({
        value: user.id,
        label: user.name ?? user.email,
      }))}
    />
  )
}
