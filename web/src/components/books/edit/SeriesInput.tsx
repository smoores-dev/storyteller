import { Series } from "@/database/series"
import { SeriesRelation } from "@/database/books"
import {
  Fieldset,
  Autocomplete,
  ActionIcon,
  Button,
  Checkbox,
  NumberInput,
  Stack,
} from "@mantine/core"
import { UseFormReturnType } from "@mantine/form"
import { IconTrash, IconPlus } from "@tabler/icons-react"

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
        <Fieldset key={s.uuid ?? i} legend="Series" className="relative">
          <Autocomplete
            label="Name"
            data={series.map((s) => s.name)}
            {...getInputProps(`series.${i}.name`)}
          />
          <Checkbox
            label="Featured"
            {...getInputProps(`series.${i}.featured`, {
              type: "checkbox",
            })}
          />
          <NumberInput
            label="Position"
            {...getInputProps(`series.${i}.position`)}
          />
          {i > 0 && (
            <ActionIcon
              variant="subtle"
              className="absolute right-4 top-0"
              onClick={() => {
                removeSeries(i)
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
