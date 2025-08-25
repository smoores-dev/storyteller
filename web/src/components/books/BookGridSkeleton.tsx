import { Box, List, Skeleton, Stack, Text } from "@mantine/core"

export function BookThumbnailSkeleton() {
  return (
    <List.Item
      className="relative scroll-mt-36"
      classNames={{ itemWrapper: "block" }}
    >
      <Box>
        <Stack gap={2}>
          <Box>
            <Stack className="mb-1 justify-center">
              <Skeleton radius="md" height="14.0625rem" width="9.1875rem" />
            </Stack>
          </Box>
          <Skeleton radius="md" height="2rem" width="9.1875rem" />
          <Skeleton radius="md" height="2rem" width="9.1875rem" />
        </Stack>
      </Box>
    </List.Item>
  )
}

export function BookGridSkeleton() {
  return (
    <>
      <Text className="mt-4 text-sm">…</Text>
      <List
        listStyleType="none"
        className="relative z-10 flex flex-row flex-wrap gap-6 sm:pr-9"
      >
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
        <BookThumbnailSkeleton />
      </List>
    </>
  )
}
