"use client"

import { BookOptions } from "./BookOptions"
import { ProcessingFailedMessage } from "./ProcessingFailedMessage"
import { ProcessingTaskStatus } from "@/apiModels/models/ProcessingStatus"
import { Paper, Group, Stack, Box, Text, Button, Progress } from "@mantine/core"
import { UUID } from "@/uuid"
import {
  getAlignedDownloadUrl,
  useListBooksQuery,
  useProcessBookMutation,
} from "@/store/api"
import { usePermissions } from "@/hooks/usePermissions"

type Props = {
  bookUuid: UUID
}

export const ProcessingTaskTypes = {
  SYNC_CHAPTERS: "Synchronizing chapters",
  SPLIT_CHAPTERS: "Pre-processing audio",
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

  const aligned = book.alignedBook?.status === "ALIGNED"

  const userFriendlyTaskType =
    book.processingTask &&
    ProcessingTaskTypes[
      book.processingTask.type as keyof typeof ProcessingTaskTypes
    ]

  if (!permissions?.bookRead) return null

  return (
    <Paper className="max-w-[600px]">
      <Group justify="space-between" wrap="nowrap" align="flex-end">
        {book.alignedBook || (book.ebook && book.audiobook) ? (
          <Stack justify="space-between" className="grow">
            {aligned ? (
              permissions.bookDownload && (
                <a
                  href={getAlignedDownloadUrl(book.uuid)}
                  className="text-st-orange-600 underline"
                  download={`${book.title}.epub`}
                >
                  Download
                </a>
              )
            ) : book.processingTask ? (
              book.processingStatus === "queued" ? (
                "Queued"
              ) : (
                <Box>
                  {userFriendlyTaskType}
                  {book.processingStatus === "processing" ? "" : " (stopped)"}
                  {book.processingTask.status ===
                    ProcessingTaskStatus.IN_ERROR && (
                    <ProcessingFailedMessage />
                  )}
                  <Progress
                    value={Math.floor(book.processingTask.progress * 100)}
                  />
                </Box>
              )
            ) : permissions.bookProcess ? (
              <Button
                className="self-start"
                onClick={() => {
                  void processBook({ uuid: book.uuid })
                }}
              >
                Start processing
              </Button>
            ) : (
              <Text>Unprocessed</Text>
            )}
          </Stack>
        ) : (
          // Just to keep the actions in the same place
          <Box />
        )}
        <BookOptions aligned={aligned} book={book} />
      </Group>
    </Paper>
  )
}
