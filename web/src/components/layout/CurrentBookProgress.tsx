import NextImage from "next/image"
import { Group, Image, RingProgress, Stack, Text, Title } from "@mantine/core"
import { ProcessingTaskTypes } from "../books/BookStatus"
import { getCoverUrl, useListBooksQuery } from "@/store/api"

export function CurrentBookProgress() {
  const { currentBook } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      currentBook: result.data?.find(
        (book) => book.processingStatus === "processing",
      ),
    }),
  })

  if (!currentBook) return null

  const userFriendlyTaskType =
    currentBook.processingTask &&
    ProcessingTaskTypes[
      currentBook.processingTask.type as keyof typeof ProcessingTaskTypes
    ]

  return (
    <Group wrap="nowrap" className="bg-st-orange-50 relative">
      <Image
        component={NextImage}
        className="rounded-r-md"
        h={150}
        w={98}
        height={150}
        width={98}
        alt=""
        aria-hidden
        src={getCoverUrl(currentBook.uuid)}
      />
      <Stack className="mb-1 self-stretch" gap={2} justify="flex-end">
        <Title order={3} size="md">
          {currentBook.title}
        </Title>

        <Text size="sm">{userFriendlyTaskType}</Text>
      </Stack>
      <RingProgress
        className="absolute right-2 top-2"
        size={40}
        thickness={4}
        roundCaps
        rootColor="st-orange.2"
        sections={[
          {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            value: currentBook.processingTask!.progress * 100,
            color: "st-orange.8",
          },
        ]}
      />
    </Group>
  )
}
