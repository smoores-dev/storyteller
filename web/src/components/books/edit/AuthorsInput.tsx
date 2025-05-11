import { Author } from "@/database/authors"
import { AuthorRelation } from "@/database/books"
import {
  Fieldset,
  Autocomplete,
  TextInput,
  ActionIcon,
  Button,
  Stack,
} from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"
import { IconTrash, IconPlus } from "@tabler/icons-react"

interface Props {
  values: AuthorRelation[]
  getInputProps: UseFormReturnType<{
    authors: AuthorRelation[]
  }>["getInputProps"]
  removeAuthor: (index: number) => void
  addAuthor: (author: AuthorRelation) => void
  authors: Author[]
}

export function AuthorsInput({
  values,
  getInputProps,
  removeAuthor,
  addAuthor,
  authors,
}: Props) {
  return (
    <Stack gap={4} className="my-4">
      {values.map((author, i) => (
        <Fieldset key={author.uuid ?? i} legend="Authors" className="relative">
          <Autocomplete
            label="Name"
            data={Array.from(new Set(authors.map((author) => author.name)))}
            {...getInputProps(`authors.${i}.name`)}
          />
          <TextInput label="Role" {...getInputProps(`authors.${i}.role`)} />
          {i > 0 && (
            <ActionIcon
              variant="subtle"
              className="absolute right-4 top-0"
              onClick={() => {
                removeAuthor(i)
              }}
            >
              <IconTrash color="red" />
            </ActionIcon>
          )}
        </Fieldset>
      ))}
      <Button
        leftSection={<IconPlus />}
        variant="outline"
        mt="sm"
        className="self-start"
        onClick={() => {
          addAuthor({
            name: "",
            role: "Author",
            fileAs: "",
          })
        }}
      >
        Add author
      </Button>
    </Stack>
  )
}
