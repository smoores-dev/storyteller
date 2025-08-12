import { Creator } from "@/database/creators"
import { TagsInput as BaseTagsInput } from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"

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
