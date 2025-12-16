import { Group, Image, RingProgress, Stack, Text, Title } from "@mantine/core"
import Link from "next/link"

import { ProcessingTaskTypes } from "@/components/books/BookStatus"
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
    <Group wrap="nowrap" className="bg-st-orange-50 relative flex items-center">
      <div className="relative">
        <Image
          className="rounded-r-md"
          h={65}
          w={40}
          alt=""
          aria-hidden
          src={getCoverUrl(currentBook.uuid, { width: 40, height: 65 })}
        />

        <div className="absolute bottom-0 h-full w-full bg-gradient-to-t from-white to-transparent"></div>
        <RingProgress
          className="absolute bottom-2 left-2"
          size={30}
          thickness={4}
          roundCaps
          rootColor="st-orange.1"
          sections={[
            {
              value: currentBook.readaloud.stageProgress * 100,
              color: "st-orange.4",
            },
          ]}
        />
      </div>
      <Stack className="mb-1 self-stretch" gap={2} justify="flex-end">
        <Title
          order={3}
          size="sm"
          className="hover:text-st-orange-600 font-sans hover:underline"
        >
          <Link href={`/books/${currentBook.uuid}`}>{currentBook.title}</Link>
        </Title>

        <Text size="xs">{userFriendlyTaskType}</Text>
      </Stack>
    </Group>
  )
}
