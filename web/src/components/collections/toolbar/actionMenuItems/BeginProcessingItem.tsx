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
import { useGpuBuildWarning } from "@/hooks/useGpuBuildWarning"
import { useListBooksQuery, useProcessBookMutation } from "@/store/api"
import { type UUID } from "@/uuid"
import { STAGE_ORDER } from "@/work/stages"

import { TitleSummary } from "./TitleSummary"

const EMPTY_BOOKS: BookWithRelations[] = []

type RestartOption = "continue" | "sync" | "transcription" | "full"

interface Props {
  selected: Set<UUID>
}

export function BeginProcessingItem({ selected }: Props) {
  const [isOpen, { open, close }] = useDisclosure()
  const [processBook] = useProcessBookMutation()
  const { guardProcessing, warningModal } = useGpuBuildWarning()

  const { books } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      books:
        result.data?.filter((book) => selected.has(book.uuid)) ?? EMPTY_BOOKS,
    }),
  })

  const singleBook = books.length === 1 ? books[0] : null

  const singleBookStageOrder = singleBook?.readaloud?.currentStage
    ? STAGE_ORDER[singleBook.readaloud.currentStage]
    : -1

  const canRestartFromSync = !singleBook || singleBookStageOrder >= 2
  const canRestartFromTranscription = !singleBook || singleBookStageOrder >= 1

  const form = useForm({
    initialValues: {
      restart: "continue" as RestartOption,
    },
  })

  return (
    <>
      {warningModal}
      <Modal opened={isOpen} onClose={close} title="Begin processing" centered>
        <Stack gap={32}>
          <Text>
            Begin processing for <TitleSummary books={books} />
          </Text>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.onSubmit(({ restart }) => {
              close()
              const restartMode = restart === "continue" ? false : restart
              guardProcessing(async (dismiss) => {
                for (const book of books) {
                  await processBook({
                    uuid: book.uuid,
                    restart: restartMode,
                    ...(dismiss && { dismissGpuWarning: true }),
                  })
                }
              })
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
                  disabled={!canRestartFromSync}
                  label="Restart from sync step (keep transcriptions)"
                />

                <Radio
                  value="transcription"
                  disabled={!canRestartFromTranscription}
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
