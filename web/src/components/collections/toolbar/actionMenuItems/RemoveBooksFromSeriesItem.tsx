import { SeriesRelation } from "@/database/books"
import {
  useLazyListSeriesQuery,
  useListBooksQuery,
  useRemoveBooksFromSeriesMutation,
} from "@/store/api"
import { UUID } from "@/uuid"
import { Button, MenuItem, Modal, MultiSelect } from "@mantine/core"
import { useForm } from "@mantine/form"
import { IconBookOff } from "@tabler/icons-react"
import { useState } from "react"

interface Props {
  selected: Set<UUID>
}

export function RemoveBooksFromSeriesItem({ selected }: Props) {
  const { series } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      series: result.data
        ? Array.from(
            result.data
              .filter((book) => selected.has(book.uuid))
              .reduce((acc, book) => {
                book.series.forEach((series) => {
                  acc.set(series.uuid, series)
                })

                return acc
              }, new Map<UUID, SeriesRelation>())
              .values(),
          )
        : [],
    }),
  })

  const [removeBooksFromSeries, { isLoading }] =
    useRemoveBooksFromSeriesMutation()

  const [refetchSeries] = useLazyListSeriesQuery()

  const [isOpen, setIsOpen] = useState(false)

  const form = useForm({
    initialValues: {
      series: [] as UUID[],
    },
  })

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={() => {
          form.reset()
          setIsOpen(false)
        }}
        title="Remove books from series"
        centered
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={form.onSubmit(async (values) => {
            await removeBooksFromSeries({
              series: values.series,
              books: Array.from(selected),
            })
            await refetchSeries()

            form.reset()
            setIsOpen(false)
          })}
        >
          <MultiSelect
            label="Series"
            placeholder="Remove from series"
            data={series.map((s) => ({
              label: s.name,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              value: s.uuid!,
            }))}
            {...form.getInputProps("series")}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </form>
      </Modal>
      <MenuItem
        leftSection={<IconBookOff size={14} className="text-red-600" />}
        onClick={() => {
          setIsOpen(true)
        }}
      >
        Remove from series
      </MenuItem>
    </>
  )
}
