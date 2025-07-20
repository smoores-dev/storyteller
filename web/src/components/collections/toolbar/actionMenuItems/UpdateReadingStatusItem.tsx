import { BookDetail } from "@/apiModels"
import { StatusInput } from "@/components/books/edit/StatusInput"
import {
  useListBooksQuery,
  useListStatusesQuery,
  useUpdateReadingStatusMutation,
} from "@/store/api"
import { UUID } from "@/uuid"
import { Button, MenuItem, Modal } from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { IconBook2 } from "@tabler/icons-react"
import { useLayoutEffect, useMemo } from "react"

const EMPTY_BOOKS: BookDetail[] = []

interface Props {
  selected: Set<UUID>
}

export function UpdateReadingStatusItem({ selected }: Props) {
  const { books } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      books:
        result.data?.filter((book) => selected.has(book.uuid)) ?? EMPTY_BOOKS,
    }),
  })

  const { data: statuses = [] } = useListStatusesQuery()

  const majorityStatus = useMemo(() => {
    const statusCounts = new Map<UUID, number>(
      statuses.map((status) => [status.uuid, 0]),
    )
    for (const book of books) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      statusCounts.set(book.statusUuid, statusCounts.get(book.statusUuid)! + 1)
    }
    return Array.from(statusCounts.entries()).reduce(
      ([accUuid, accCount], [uuid, count]) => {
        if (count > accCount) return [uuid, count]
        return [accUuid, accCount]
      },
    )[0]
  }, [books, statuses])

  const [updateReadingStatus, { isLoading }] = useUpdateReadingStatusMutation()

  const [isOpen, { close, open }] = useDisclosure()

  const form = useForm({
    initialValues: {
      statusUuid: majorityStatus,
    },
  })

  useLayoutEffect(() => {
    form.initialize({
      statusUuid: majorityStatus,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [majorityStatus])

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={() => {
          form.reset()
          close()
        }}
        title="Update reading status for books"
        centered
      >
        <form
          className="flex min-h-60 flex-col justify-between"
          onSubmit={form.onSubmit(async (values) => {
            await updateReadingStatus({
              status: values.statusUuid,
              books: Array.from(selected),
            })

            form.reset()
            close()
          })}
        >
          <StatusInput
            className="self-center"
            disabled={!majorityStatus}
            value={form.values.statusUuid}
            onChange={(value) => {
              form.setFieldValue("statusUuid", value)
            }}
            options={statuses}
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </form>
      </Modal>
      <MenuItem
        leftSection={<IconBook2 size={14} />}
        onClick={() => {
          open()
        }}
      >
        Update reading status
      </MenuItem>
    </>
  )
}
