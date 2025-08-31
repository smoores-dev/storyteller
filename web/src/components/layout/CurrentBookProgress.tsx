import { Group, Image, RingProgress, Stack, Text, Title } from "@mantine/core"
import { ProcessingTaskTypes } from "../books/BookStatus"
import { getCoverUrl, useListBooksQuery } from "@/store/api"

export function CurrentBookProgress() {
  const { currentBook } = useListBooksQuery(undefined, {
    selectFromResult: (result) => ({
      currentBook: result.data?.find(
        (book) => book.readaloud?.status === "PROCESSING",
      ),
    }),
  })

  if (!currentBook?.readaloud) return null

  const userFriendlyTaskType =
    ProcessingTaskTypes[currentBook.readaloud.currentStage]

  return (
    <Group wrap="nowrap" className="bg-st-orange-50 relative">
      <Image
        className="rounded-r-md"
        h={75}
        w={49}
        alt=""
        aria-hidden
        src={getCoverUrl(currentBook.uuid, { width: 49, height: 75 })}
      />
      <Stack className="mb-1 self-stretch" gap={2} justify="flex-end">
        <Title order={3} size="sm" className="font-sans">
          {currentBook.title}
        </Title>

        <Text size="xs">{userFriendlyTaskType}</Text>
      </Stack>
      <RingProgress
        className="absolute right-2 top-2"
        size={30}
        thickness={4}
        roundCaps
        rootColor="st-orange.2"
        sections={[
          {
            value: currentBook.readaloud.stageProgress * 100,
            color: "st-orange.8",
          },
        ]}
      />
    </Group>
  )
}
