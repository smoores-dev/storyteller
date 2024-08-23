import { UUID } from "@/uuid"
import { getDatabase } from "./connection"
import { PROCESSING_TASK_ORDER } from "./processingTasks"
import {
  ProcessingTaskType,
  ProcessingTaskStatus,
} from "@/apiModels/models/ProcessingStatus"
import { BookEvents } from "@/events"
import { BookDetail } from "@/apiModels"

/**
 * This function only exists to support old clients that haven't
 * started using UUIDs yet. It's not particularly efficient and should
 * be removed after we feel confident that all clients (specifically,
 * mobile apps) have likely been updated.
 */
export function getBookUuid(bookIdOrUuid: string): UUID {
  if (bookIdOrUuid.includes("-")) {
    // This is already a UUID, so just return it
    return bookIdOrUuid as UUID
  }

  // Otherwise, parse into an int and fetch the UUID from the db
  const bookId = parseInt(bookIdOrUuid, 10)

  const db = getDatabase()
  const statement = db.prepare<{ bookId: number }>(
    `
    SELECT uuid
    FROM book
    WHERE id = $bookId
    `,
  )
  const { uuid } = statement.get({ bookId }) as { uuid: UUID }

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

export function createBook(title: string, authors: AuthorInput[]) {
  const db = getDatabase()

  const statement = db.prepare<{ title: string }>(
    `
    INSERT INTO book (id, title) VALUES (ABS(RANDOM()) % 9007199254740990 + 1, $title)
    RETURNING uuid, id
    `,
  )

  const { uuid: bookUuid, id } = statement.get({ title }) as {
    uuid: UUID
    id: number
  }

  const book: Book = {
    uuid: bookUuid,
    id,
    title,
    authors: [],
  }

  const insertAuthorStatement = db.prepare<{
    name: string
    fileAs: string | null
  }>(`
    INSERT INTO author (name, file_as) VALUES ($name, $fileAs)
    RETURNING uuid
    `)

  const insertAuthorToBookStatement = db.prepare<{
    bookUuid: UUID
    authorUuid: UUID
    role: string | null
  }>(
    `
    INSERT INTO author_to_book (book_uuid, author_uuid, role)
    VALUES ($bookUuid, $authorUuid, $role)
    `,
  )

  for (const author of authors) {
    const { uuid: authorUuid } = insertAuthorStatement.get({
      name: author.name,
      fileAs: author.fileAs,
    }) as { uuid: UUID }

    insertAuthorToBookStatement.run({
      bookUuid,
      authorUuid,
      role: author.role,
    })

    book.authors.push({
      uuid: authorUuid,
      name: author.name,
      fileAs: author.fileAs,
      role: author.role,
    })
  }

  BookEvents.emit("message", {
    type: "bookCreated",
    bookUuid: book.uuid,
    payload: book as BookDetail,
  })

  return book
}

export function getBooks(
  bookUuids: string[] | null = null,
  syncedOnly = false,
): Book[] {
  const db = getDatabase()

  const statement = db.prepare(`
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
    `)

  const bookRows = (bookUuids ? statement.all(bookUuids) : statement.all()) as {
    book_uuid: UUID
    id: number
    title: string
    role: string
    author_uuid: UUID | null
    name: string
    file_as: string
    processing_task_uuid: UUID | null
    type: ProcessingTaskType
    status: ProcessingTaskStatus
    progress: number
  }[]

  const booksRecord = bookRows.reduce<
    Record<UUID, Omit<Book, "authors"> & { authors: Record<UUID, Author> }>
  >((acc, row) => {
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

    const author = row.author_uuid && book.authors[row.author_uuid]

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
  }, {})

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

export function getBooksLegacy_(): LegacyBook[] {
  const db = getDatabase()
  return db
    .prepare(
      `
    SELECT uuid, id, title, epub_filename AS epubFilename, audio_filename AS audioFilename, audio_filetype AS audioFiletype
    FROM book
    WHERE epub_filename IS NOT NULL OR audio_filename IS NOT NULL
    `,
    )
    .all() as LegacyBook[]
}

export function clearFilenameColumns(bookUuid: UUID) {
  const db = getDatabase()

  db.prepare<{ bookUuid: UUID }>(
    `
    UPDATE book
    SET epub_filename=null, audio_filename=null
    WHERE book.uuid = $bookUuid
    `,
  ).run({
    bookUuid,
  })
}

export function deleteBook(bookUuid: UUID) {
  const db = getDatabase()

  db.prepare<{ bookUuid: UUID }>(
    `
    DELETE FROM processing_task
    WHERE book_uuid = $bookUuid
    `,
  ).run({
    bookUuid,
  })

  db.prepare<{ bookUuid: UUID }>(
    `
    DELETE FROM author_to_book
    WHERE book_uuid = $bookUuid
    `,
  ).run({ bookUuid })

  db.prepare(
    `
    DELETE FROM author
    WHERE author.uuid
      NOT IN (
        SELECT author_uuid
        FROM author_to_book
      )
    `,
  ).run()

  db.prepare<{ bookUuid: UUID }>(
    `
    DELETE FROM book
    WHERE uuid = $bookUuid
    `,
  ).run({
    bookUuid,
  })

  BookEvents.emit("message", {
    type: "bookDeleted",
    bookUuid,
    payload: undefined,
  })
}

export function updateBook(uuid: UUID, title: string, authors: AuthorInput[]) {
  const db = getDatabase()

  db.prepare<{ title: string; uuid: UUID }>(
    `
    UPDATE book
    SET title = $title
    WHERE uuid = $uuid
    `,
  ).run({
    title,
    uuid,
  })

  const insertAuthorStatement = db.prepare<{
    name: string
    fileAs: string | null
  }>(`
    INSERT INTO author (name, file_as)
    VALUES ($name, $fileAs)
    RETURNING uuid
    `)

  const insertAuthorToBookStatement = db.prepare<{
    bookUuid: UUID
    authorUuid: UUID
    role: string | null
  }>(`
    INSERT INTO author_to_book (book_uuid, author_uuid, role)
    VALUES ($bookUuid, $authorUuid, $role)
    `)

  const updateAuthorStatement = db.prepare<{ name: string; uuid: UUID }>(`
    UPDATE author
    SET name = $name
    WHERE uuid = $uuid
    `)
  for (const author of authors) {
    if (author.uuid === "") {
      const { uuid: authorUuid } = insertAuthorStatement.get({
        name: author.name,
        fileAs: author.fileAs,
      }) as { uuid: UUID }

      insertAuthorToBookStatement.run({
        bookUuid: uuid,
        authorUuid,
        role: author.role,
      })
    } else {
      updateAuthorStatement.run({
        name: author.name,
        uuid: author.uuid,
      })
    }
  }

  const [book] = getBooks([uuid])

  BookEvents.emit("message", {
    type: "bookUpdated",
    bookUuid: uuid,
    payload: {
      title,
      authors:
        book?.authors.map((author) => ({
          ...author,
          file_as: author.fileAs ?? author.name,
          role: author.role ?? "aut",
        })) ?? [],
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return book!
}
