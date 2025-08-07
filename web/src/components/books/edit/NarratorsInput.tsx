import { Narrator } from "@/database/narrators"
import { TagsInput as BaseTagsInput } from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"

type GetInputProps = UseFormReturnType<{ narrators: string[] }>["getInputProps"]

type Props = ReturnType<GetInputProps> & { narrators: Narrator[] }

export function NarratorsInput({ narrators, ...props }: Props) {
  return (
    <BaseTagsInput
      label="Narrators"
      data={narrators.map((narrator) => narrator.name)}
      {...props}
    ></BaseTagsInput>
  )
}
