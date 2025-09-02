import { TagsInput as BaseTagsInput } from "@mantine/core"
import { type UseFormReturnType } from "@mantine/form"

import { type Creator } from "@/database/creators"

type GetInputProps = UseFormReturnType<{ authors: string[] }>["getInputProps"]

type Props = ReturnType<GetInputProps> & { authors: Creator[] }

export function AuthorsInput({ authors, ...props }: Props) {
  return (
    <BaseTagsInput
      label="Authors"
      data={authors.map((author) => author.name)}
      {...props}
    ></BaseTagsInput>
  )
}
