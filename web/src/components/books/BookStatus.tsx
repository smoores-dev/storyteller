"use client"

import { Box, Button, Group, Paper, Progress, Stack, Text } from "@mantine/core"

import { usePermissions } from "@/hooks/usePermissions"
import { useListBooksQuery, useProcessBookMutation } from "@/store/api"
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

  if (!book) return null

  const aligned = !!book.readaloud?.filepath

  const userFriendlyTaskType =
    book.readaloud?.currentStage &&
    ProcessingTaskTypes[book.readaloud.currentStage]

  if (!permissions?.bookRead) return null

  return (
    <Paper>
      <Group justify="space-between" wrap="nowrap" align="flex-end">
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
          // Just to keep the actions in the same place
          <Box />
        )}
      </Group>
    </Paper>
  )
}
