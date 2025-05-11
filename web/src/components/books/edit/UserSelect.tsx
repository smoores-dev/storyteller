import { User } from "@/apiModels"
import { UUID } from "@/uuid"
import { MultiSelect } from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"

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
        value: user.uuid,
        label: user.fullName,
      }))}
    />
  )
}
