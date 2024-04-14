import { UUID } from "@/uuid"
import { getDatabase } from "./connection"
import { PROCESSING_TASK_ORDER } from "./processingTasks"
import {
  ProcessingTaskType,
  ProcessingTaskStatus,
} from "@/apiModels/models/ProcessingStatus"

/**
 * This function only exists to support old clients that haven't
 * started using UUIDs yet. It's not particularly efficient and should
 * be removed after we feel confident that all clients (specifically,
 * mobile apps) have likely been updated.
 */
export async function getBookUuid(bookIdOrUuid: string): Promise<UUID> {
  if (bookIdOrUuid.includes("-")) {
    // This is already a UUID, so just return it
    return bookIdOrUuid as UUID
  }

  // Otherwise, parse into an int and fetch the UUID from the db
  const bookId = parseInt(bookIdOrUuid, 10)

  const db = await getDatabase()
  const { uuid } = await db.get<{ uuid: UUID }>(
    `
    SELECT uuid
    FROM book
    WHERE id = $book_id
    `,
    { $book_id: bookId },
  )

  return uuid
}

export type Author = {
  uuid: UUID
  name: string
  fileAs?: string | null
  role?: string | null
}

export type ProcessingStatus = {
  currentTask: ProcessingTaskType
  progress: number
  status: ProcessingTaskStatus
}

export type Book = {
  uuid: UUID
  id: number
  title: string
  authors: Author[]
  processingStatus?: ProcessingStatus
}

export type AuthorInput = {
  uuid: UUID | ""
  name: string
  fileAs: string | null
  role: string | null
}

export async function createBook(title: string, authors: AuthorInput[]) {
  const db = await getDatabase()

  const { uuid: bookUuid, id } = await db.get<{ uuid: UUID; id: number }>(
    `
    INSERT INTO book (id, title) VALUES (ABS(RANDOM()) % 9007199254740990 + 1, $title)
    RETURNING uuid, id
    `,
    { $title: title },
  )

  const book: Book = {
    uuid: bookUuid,
    id,
    title,
    authors: [],
  }

  for (const author of authors) {
    const { uuid: authorUuid } = await db.get<{ uuid: UUID }>(
      `
      INSERT INTO author (name, file_as) VALUES ($name, $file_as)
      RETURNING uuid
      `,
      { $name: author.name, $file_as: author.fileAs },
    )

    await db.run(
      `
      INSERT INTO author_to_book (book_uuid, author_uuid, role)
      VALUES ($book_uuid, $author_uuid, $role)
      `,
      {
        $book_uuid: bookUuid,
        $author_uuid: authorUuid,
        $role: author.role,
      },
    )

    book.authors.push({
      uuid: authorUuid,
      name: author.name,
      fileAs: author.fileAs,
      role: author.role,
    })
  }

  return book
}

export async function getBooks(
  bookUuids: string[] | null = null,
  syncedOnly = false,
): Promise<Book[]> {
  const db = await getDatabase()

  const bookRows = await db.all<{
    book_uuid: UUID
    id: number
    title: string
    role: string
    author_uuid: UUID
    name: string
    file_as: string
    processing_task_uuid: UUID
    type: ProcessingTaskType
    status: ProcessingTaskStatus
    progress: number
  }>(
    `
    SELECT
      book.uuid AS book_uuid, book.id, book.title,
      author_to_book.role,
      author.uuid AS author_uuid, author.name, author.file_as,
      processing_task.uuid AS processing_task_uuid, processing_task.type, processing_task.status, processing_task.progress
    FROM book
    LEFT JOIN author_to_book
      ON book.uuid = author_to_book.book_uuid
    LEFT JOIN author
      ON author_to_book.author_uuid = author.uuid
    LEFT JOIN processing_task
      ON book.uuid = processing_task.book_uuid
    ${bookUuids ? `WHERE book.uuid IN (${Array.from({ length: bookUuids.length }).fill("?").join(",")})` : ""}
    `,
    bookUuids ?? undefined,
  )

  const booksRecord = bookRows.reduce(
    (acc, row) => {
      const book = acc[row.book_uuid]
      if (!book) {
        return {
          ...acc,
          [row.book_uuid]: {
            uuid: row.book_uuid,
            id: row.id,
            title: row.title,
            authors:
              row.author_uuid !== null
                ? {
                    [row.author_uuid]: {
                      uuid: row.author_uuid,
                      name: row.name,
                      fileAs: row.file_as,
                      role: row.role,
                    },
                  }
                : {},
            ...(row.processing_task_uuid !== null && {
              processingStatus: {
                currentTask: row.type,
                progress: row.progress,
                status: row.status,
              },
            }),
          },
        }
      }

      const author = book.authors[row.author_uuid]

      if (!author && row.author_uuid !== null) {
        return {
          ...acc,
          [book.uuid]: {
            ...book,
            authors: {
              ...book.authors,
              [row.author_uuid]: {
                uuid: row.author_uuid,
                name: row.name,
                fileAs: row.file_as,
                role: row.role,
              },
            },
            ...(row.processing_task_uuid !== null && {
              processingStatus: {
                currentTask: row.type,
                progress: row.progress,
                status: row.status,
              },
            }),
          },
        }
      }

      const processingStatus = book.processingStatus

      if (
        row.processing_task_uuid !== null &&
        (!processingStatus ||
          (PROCESSING_TASK_ORDER[row.type] >
            PROCESSING_TASK_ORDER[processingStatus.currentTask] &&
            processingStatus.status === ProcessingTaskStatus.COMPLETED))
      ) {
        return {
          ...acc,
          [book.uuid]: {
            ...book,
            processingStatus: {
              currentTask: row.type,
              progress: row.progress,
              status: row.status,
            },
          },
        }
      }

      return acc
    },
    {} as Record<
      UUID,
      Omit<Book, "authors"> & { authors: Record<UUID, Author> }
    >,
  )

  const books = Object.values(booksRecord).map((book) => ({
    ...book,
    authors: Object.values(book.authors),
  }))

  if (syncedOnly) {
    return books.filter(
      (book) =>
        book.processingStatus &&
        book.processingStatus.currentTask ===
          ProcessingTaskType.SYNC_CHAPTERS &&
        book.processingStatus.status === ProcessingTaskStatus.COMPLETED,
    )
  }

  return books
}

type LegacyBook = {
  uuid: UUID
  id: number
  title: string
  epubFilename: string
  audioFilename: string
  audioFiletype: string
}

export async function getBooksLegacy_(): Promise<LegacyBook[]> {
  const db = await getDatabase()
  return db.all<LegacyBook>(
    `
    SELECT uuid, id, title, epub_filename AS epubFilename, audio_filename AS audioFilename, audio_filetype AS audioFiletype
    FROM book
    WHERE epub_filename IS NOT NULL OR audio_filename IS NOT NULL
    `,
  )
}

export async function clearFilenameColumns(bookUuid: UUID) {
  const db = await getDatabase()

  await db.run(
    `
    UPDATE book
    SET epub_filename=null, audio_filename=null
    WHERE book.uuid = $book_uuid
    `,
    {
      $book_uuid: bookUuid,
    },
  )
}

export async function deleteBook(bookUuid: UUID) {
  const db = await getDatabase()

  await db.run(
    `
    DELETE FROM processing_task
    WHERE book_uuid = $book_uuid
    `,
    {
      $book_uuid: bookUuid,
    },
  )

  await db.run(
    `
    DELETE FROM author_to_book
    WHERE book_uuid = $book_uuid
    `,
    { $book_uuid: bookUuid },
  )

  await db.run(
    `
    DELETE FROM author
    WHERE author.uuid
      NOT IN (
        SELECT author_uuid
        FROM author_to_book
      )
    `,
  )

  await db.run(
    `
    DELETE FROM book
    WHERE uuid = $book_uuid
    `,
    {
      $book_uuid: bookUuid,
    },
  )
}

export async function updateBook(
  uuid: UUID,
  title: string,
  authors: AuthorInput[],
) {
  const db = await getDatabase()

  await db.run(
    `
    UPDATE book
    SET title = $title
    WHERE uuid = $uuid
    `,
    {
      $title: title,
      $uuid: uuid,
    },
  )

  for (const author of authors) {
    if (author.uuid === "") {
      const { uuid: authorUuid } = await db.get<{ uuid: UUID }>(
        `
        INSERT INTO author (name, file_as)
        VALUES ($name, $file_as)
        RETURNING uuid
        `,
        { $name: author.name, $file_as: author.fileAs },
      )

      await db.run(
        `
        INSERT INTO author_to_book (book_uuid, author_uuid, role)
        VALUES ($book_uuid, $author_uuid, $role)
        `,
        {
          $book_uuid: uuid,
          $author_uuid: authorUuid,
          $role: author.role,
        },
      )
    } else {
      await db.run(
        `
        UPDATE author
        SET name = $name
        WHERE uuid = $uuid
        `,
        {
          $name: author.name,
          $uuid: author.uuid,
        },
      )
    }
  }

  const [book] = await getBooks([uuid])
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return book!
}
