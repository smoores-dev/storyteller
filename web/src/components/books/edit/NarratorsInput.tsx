import { TagsInput as BaseTagsInput } from "@mantine/core"
import { type UseFormReturnType } from "@mantine/form"

import { type Creator } from "@/database/creators"

type GetInputProps = UseFormReturnType<{ narrators: string[] }>["getInputProps"]

type Props = ReturnType<GetInputProps> & { narrators: Creator[] }

export function NarratorsInput({ narrators, ...props }: Props) {
  return (
    <BaseTagsInput
      label="Narrators"
      data={narrators.map((narrator) => narrator.name)}
      {...props}
    ></BaseTagsInput>
  )
}
