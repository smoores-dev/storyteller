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
import { IconProgress } from "@tabler/icons-react"

import { type BookWithRelations } from "@/database/books"
import { useListBooksQuery, useProcessBookMutation } from "@/store/api"
import { type UUID } from "@/uuid"

import { TitleSummary } from "./TitleSummary"

const EMPTY_BOOKS: BookWithRelations[] = []

type RestartOption = "continue" | "sync" | "transcription" | "full"

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
      restart: "continue" as RestartOption,
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
              const restartMode = restart === "continue" ? false : restart
              for (const book of books) {
                await processBook({
                  uuid: book.uuid,
                  restart: restartMode,
                })
              }
            })}
          >
            <RadioGroup
              label="Restart mode"
              classNames={{ label: "my-1" }}
              {...form.getInputProps("restart")}
            >
              <Stack gap={12}>
                <Radio value="continue" label="Continue where left off" />
                <Radio
                  value="sync"
                  label="Restart from sync step (keep transcriptions)"
                />
                <Radio
                  value="transcription"
                  label="Restart from transcription step (keep audio)"
                />
                <Radio
                  value="full"
                  label="Full restart (delete all cache files)"
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
