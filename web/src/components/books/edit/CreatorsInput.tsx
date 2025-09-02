import {
  ActionIcon,
  Autocomplete,
  Button,
  Fieldset,
  Select,
  Stack,
} from "@mantine/core"
import { type UseFormReturnType } from "@mantine/form"
import { IconPlus, IconTrash } from "@tabler/icons-react"

import { type CreatorRelation } from "@/database/books"
import { type Creator } from "@/database/creators"

import { creatorRelators } from "./marcRelators"

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
            data={creatorRelators}
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
            role: null,
            fileAs: "",
          })
        }}
      >
        Add creator
      </Button>
    </Stack>
  )
}
