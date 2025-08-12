import { Creator } from "@/database/creators"
import { TagsInput as BaseTagsInput } from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"

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
