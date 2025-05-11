import { Tag } from "@/database/tags"
import { TagsInput as BaseTagsInput } from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"

type GetInputProps = UseFormReturnType<{ tags: string[] }>["getInputProps"]

type Props = ReturnType<GetInputProps> & { tags: Tag[] }

export function TagsInput({ tags, ...props }: Props) {
  return (
    <BaseTagsInput
      label="Tags"
      data={tags.map((tag) => tag.name)}
      {...props}
    ></BaseTagsInput>
  )
}
