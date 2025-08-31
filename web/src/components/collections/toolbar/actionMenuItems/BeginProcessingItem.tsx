import { useListBooksQuery, useProcessBookMutation } from "@/store/api"
import { UUID } from "@/uuid"
import {
  Button,
  Group,
  MenuItem,
  Modal,
  Radio,
  RadioGroup,
  Stack,
  Text,
} from "@mantine/core"
import { useForm } from "@mantine/form"
import { useDisclosure } from "@mantine/hooks"
import { TitleSummary } from "./TitleSummary"

import { IconProgress } from "@tabler/icons-react"
import { BookWithRelations } from "@/database/books"

const EMPTY_BOOKS: BookWithRelations[] = []

interface Props {
  selected: Set<UUID>
}

export function BeginProcessingItem({ selected }: Props) {
  const [isOpen, { open, close }] = useDisclosure()
  const [processBook] = useProcessBookMutation()

  const { books } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      books:
        result.data?.filter((book) => selected.has(book.uuid)) ?? EMPTY_BOOKS,
    }),
  })

  const form = useForm({
    initialValues: {
      restart: "no" as "no" | "yes",
    },
  })

  return (
    <>
      <Modal opened={isOpen} onClose={close} title="Begin processing" centered>
        <Stack gap={32}>
          <Text>
            Begin processing for <TitleSummary books={books} />
          </Text>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.onSubmit(async ({ restart }) => {
              close()
              for (const book of books) {
                await processBook({
                  uuid: book.uuid,
                  restart: restart === "yes",
                })
              }
            })}
          >
            <RadioGroup
              label="Delete cache files?"
              classNames={{ label: "my-1" }}
              {...form.getInputProps("restart")}
            >
              <Stack gap={12}>
                <Radio value="no" label="No, restart where left off" />
                <Radio
                  value="yes"
                  label="Yes, restart from the beginning of processing"
                />
              </Stack>
            </RadioGroup>
            <Group justify="space-between">
              <Button variant="subtle" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">Start</Button>
            </Group>
          </form>
        </Stack>
      </Modal>
      <MenuItem leftSection={<IconProgress size={14} />} onClick={open}>
        Begin processing
      </MenuItem>
    </>
  )
}
