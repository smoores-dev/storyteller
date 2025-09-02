import { TagsInput as BaseTagsInput } from "@mantine/core"
import { type UseFormReturnType } from "@mantine/form"

import { type Tag } from "@/database/tags"

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
