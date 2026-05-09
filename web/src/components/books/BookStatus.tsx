"use client"

import {
  Box,
  Button,
  Group,
  Menu,
  Paper,
  Progress,
  Stack,
  Text,
} from "@mantine/core"
import { IconChevronDown } from "@tabler/icons-react"

import { usePermissions } from "@/hooks/usePermissions"
import {
  useCancelScanMutation,
  useGetScanStateQuery,
  useListBooksQuery,
  useProcessBookMutation,
  useTriggerBookScanMutation,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { BookOptions } from "./BookOptions"
import { ProcessingFailedMessage } from "./ProcessingFailedMessage"

type Props = {
  bookUuid: UUID
}

export const ProcessingTaskTypes = {
  SYNC_CHAPTERS: "Synchronizing chapters",
  SPLIT_TRACKS: "Pre-processing audio",
  TRANSCRIBE_CHAPTERS: "Transcribing tracks",
}

export function BookStatus({ bookUuid }: Props) {
  const { book } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      book: result.data?.find((book) => book.uuid === bookUuid),
    }),
  })

  const permissions = usePermissions()

  const [processBook] = useProcessBookMutation()
  const [triggerBookScan, { isLoading: isTriggeringScan }] =
    useTriggerBookScanMutation()
  const [cancelScan, { isLoading: isCancellingScan }] = useCancelScanMutation()

  const { data: scanState } = useGetScanStateQuery(undefined, {
    pollingInterval: 5_000,
    skip: !permissions?.bookProcess,
  })

  if (!book) return null

  const aligned = !!book.readaloud?.filepath

  const userFriendlyTaskType =
    book.readaloud?.currentStage &&
    ProcessingTaskTypes[book.readaloud.currentStage]

  if (!permissions?.bookRead) return null

  return (
    <Paper>
      <Group justify="space-between" wrap="nowrap" align="center">
        <BookOptions aligned={aligned} book={book} />

        {book.readaloud || (book.ebook && book.audiobook) ? (
          <Stack justify="space-between" className="grow">
            {book.readaloud?.status ? (
              book.readaloud.status === "QUEUED" ? (
                "Queued for alignment"
              ) : book.readaloud.status === "ALIGNED" ? (
                "Aligned"
              ) : (
                <Box>
                  {userFriendlyTaskType}
                  {book.readaloud.status === "STOPPED" ? " (stopped)" : ""}
                  {book.readaloud.status === "ERROR" && (
                    <ProcessingFailedMessage />
                  )}
                  <Progress
                    value={Math.floor(book.readaloud.stageProgress * 100)}
                  />
                </Box>
              )
            ) : permissions.bookProcess ? (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => {
                  void processBook({ uuid: book.uuid })
                }}
              >
                Create readaloud
              </Button>
            ) : (
              <Text>Unprocessed</Text>
            )}
          </Stack>
        ) : (
          <Box />
        )}

        {permissions.bookProcess && (
          <Group gap="xs">
            <Button.Group>
              <Button
                variant="subtle"
                size="compact-sm"
                loading={isTriggeringScan}
                onClick={() => {
                  void triggerBookScan({ uuid: book.uuid })
                }}
              >
                Scan
              </Button>
              <Menu position="bottom-end">
                <Menu.Target>
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    disabled={isTriggeringScan}
                    px={4}
                  >
                    <IconChevronDown size={14} />
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    onClick={() => {
                      void triggerBookScan({ uuid: book.uuid, force: true })
                    }}
                  >
                    Force rescan (re-read metadata from files even if unchanged
                    since last scan)
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Button.Group>

            {scanState?.running && (
              <Button
                variant="subtle"
                color="red"
                size="compact-sm"
                loading={isCancellingScan}
                onClick={() => {
                  void cancelScan()
                }}
              >
                Cancel scan
              </Button>
            )}
          </Group>
        )}
      </Group>
    </Paper>
  )
}
