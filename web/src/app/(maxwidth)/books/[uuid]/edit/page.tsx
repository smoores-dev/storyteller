import { BookDetail } from "@/apiModels"
import { Stack, Text, Title } from "@mantine/core"
import { BookStatus } from "@/components/books/BookStatus"
import { BookEditForm } from "@/components/books/edit/BookEditForm"
import { fetchApiRoute } from "@/app/fetchApiRoute"

type Props = {
  params: Promise<{
    uuid: string
  }>
}

export default async function BookEditPage(props: Props) {
  const params = await props.params

  const { uuid } = params

  const book = await fetchApiRoute<BookDetail>(`/books/${uuid}`)

  return (
    <Stack gap={24}>
      <Title order={2}>{book.title}</Title>
      <BookStatus bookUuid={book.uuid} />
      {(book.alignedAt ||
        book.alignedWith ||
        book.alignedByStorytellerVersion) && (
        <Stack className="rounded bg-gray-100 p-4">
          {book.alignedAt && (
            <Text>
              <span className="font-bold">Last aligned:</span>{" "}
              {new Date(book.alignedAt).toLocaleString()}
            </Text>
          )}
          {book.alignedWith && (
            <Text>
              <span className="font-bold">Transcription engine:</span>{" "}
              {book.alignedWith}
            </Text>
          )}
          {book.alignedByStorytellerVersion && (
            <Text>
              <span className="font-bold">
                Storyteller version used to align:
              </span>{" "}
              {book.alignedByStorytellerVersion}
            </Text>
          )}
        </Stack>
      )}
      <BookEditForm book={book} />
    </Stack>
  )
}
