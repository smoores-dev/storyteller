import {
  ActionIcon,
  Autocomplete,
  Button,
  Checkbox,
  Fieldset,
  NumberInput,
  Stack,
} from "@mantine/core"
import { type UseFormReturnType } from "@mantine/form"
import { IconPlus, IconTrash } from "@tabler/icons-react"

import { type SeriesRelation } from "@/database/books"
import { type Series } from "@/database/series"

interface Props {
  values: SeriesRelation[]
  getInputProps: UseFormReturnType<{
    series: SeriesRelation[]
  }>["getInputProps"]
  removeSeries: (index: number) => void
  addSeries: (series: SeriesRelation) => void
  series: Series[]
}

export function SeriesInput({
  values,
  getInputProps,
  removeSeries,
  addSeries,
  series,
}: Props) {
  return (
    <Stack gap={4} className="my-4">
      {values.map((s, i) => (
        <Fieldset
          key={s.uuid ?? i}
          legend="Series"
          className="relative flex flex-col gap-4"
        >
          <Autocomplete
            label="Name"
            data={series.map((s) => s.name)}
            {...getInputProps(`series.${i}.name`)}
          />
          <Checkbox
            label="Featured / Primary Series"
            {...getInputProps(`series.${i}.featured`, {
              type: "checkbox",
            })}
            onChange={(e) => {
              const checked = e.currentTarget.checked
              for (let j = 0; j < values.length; j++) {
                const onChange = getInputProps(`series.${j}.featured`)
                  .onChange as (c: boolean) => void

                onChange(false)
              }
              const onChange = getInputProps(`series.${i}.featured`)
                .onChange as (c: boolean) => void

              onChange(checked)
            }}
          />
          <NumberInput
            label="Position"
            {...getInputProps(`series.${i}.position`)}
          />
          <ActionIcon
            variant="subtle"
            className="absolute right-4 top-0"
            onClick={() => {
              removeSeries(i)
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
          addSeries({
            name: "",
            featured: !values.length,
            position: 1,
          })
        }}
      >
        Add series
      </Button>
    </Stack>
  )
}
