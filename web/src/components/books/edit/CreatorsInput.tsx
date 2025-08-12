import { Creator } from "@/database/creators"
import { CreatorRelation } from "@/database/books"
import {
  Fieldset,
  Autocomplete,
  ActionIcon,
  Button,
  Stack,
  Select,
} from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"
import { IconTrash, IconPlus } from "@tabler/icons-react"
import { marceRelators } from "./marcRelators"

interface Props {
  values: CreatorRelation[]
  getInputProps: UseFormReturnType<{
    creators: CreatorRelation[]
  }>["getInputProps"]
  removeCreator: (index: number) => void
  addCreator: (creator: CreatorRelation) => void
  creators: Creator[]
}

export function CreatorsInput({
  values,
  getInputProps,
  removeCreator,
  addCreator,
  creators,
}: Props) {
  return (
    <Stack gap={4} className="my-4">
      {values.map((creator, i) => (
        <Fieldset
          key={creator.uuid ?? i}
          legend="Additional creators"
          className="relative"
        >
          <Autocomplete
            label="Name"
            data={Array.from(new Set(creators.map((creator) => creator.name)))}
            {...getInputProps(`creators.${i}.name`)}
          />
          <Select
            searchable
            data={marceRelators}
            label="Role"
            {...getInputProps(`creators.${i}.role`)}
          />
          <ActionIcon
            variant="subtle"
            className="absolute right-4 top-0"
            onClick={() => {
              removeCreator(i)
            }}
          >
            <IconTrash color="red" />
          </ActionIcon>
        </Fieldset>
      ))}
      <Button
        leftSection={<IconPlus />}
        variant="outline"
        mt="sm"
        className="self-start"
        onClick={() => {
          addCreator({
            name: "",
            role: "",
            fileAs: "",
          })
        }}
      >
        Add creator
      </Button>
    </Stack>
  )
}
