"use client"

import { useRef, useState } from "react"
import axios from "axios"

import styles from "./books.module.css"
import { Button } from "@ariakit/react"
import { BookDetail } from "@/apiClient"
import { useApiClient } from "@/hooks/useApiClient"
import { useApiToken } from "@/hooks/useApiToken"

type Props = {
  apiHost: string
  onSubmit: (book: BookDetail) => void
}

export default function BookUpload({ apiHost, onSubmit }: Props) {
  const token = useApiToken()
  const client = useApiClient(apiHost, token)

  const epubInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const [epubUploadProgress, setEpubUploadProgress] = useState<number | null>(
    null
  )
  const [audioUploadProgress, setAudioUploadProgress] = useState<number | null>(
    null
  )
  const [book, setBook] = useState<BookDetail | null>(null)

  const bookTitle = book?.title
  const bookAuthorName = book?.authors[0]?.name

  return (
    <>
      {bookTitle && (
        <p>
          Adding &ldquo;{book.title}&rdquo;{" "}
          {bookAuthorName && `by ${bookAuthorName}`}
        </p>
      )}
      <h2 className={styles["book-upload-heading"]}>Upload epub file</h2>
      <form
        id="epub-upload"
        onSubmit={(event) => {
          event.preventDefault()
          if (!epubInputRef.current?.files?.[0]) return

          axios
            .postForm<BookDetail>(
              `${apiHost}/books/epub`,
              { file: epubInputRef.current.files[0] },
              {
                headers: {
                  Authorization: `Bearer ${token?.access_token}`,
                },
                onUploadProgress({ progress }) {
                  setEpubUploadProgress(progress ?? null)
                },
              }
            )
            .then(({ data: book }) => {
              setBook(book)
            })
        }}
      >
        <div>
          <input
            id="epub-file"
            name="epub-file"
            ref={epubInputRef}
            type="file"
          />
        </div>
        <Button disabled={epubUploadProgress !== null} type="submit">
          Upload
        </Button>
      </form>
      <div>
        {epubUploadProgress !== null && (
          <p>Uploading... {Math.floor(epubUploadProgress * 100)}%</p>
        )}
      </div>
      <h2 className={styles["book-upload-heading"]}>Upload audio file</h2>
      <form
        id="audio-upload"
        onSubmit={(event) => {
          event.preventDefault()
          if (!audioInputRef.current?.files?.[0]) return

          axios.postForm(
            `${apiHost}/books/${book?.id}/audio`,
            { file: audioInputRef.current.files[0] },
            {
              headers: {
                Authorization: `Bearer ${token?.access_token}`,
              },
              onUploadProgress({ progress }) {
                setAudioUploadProgress(progress ?? null)
              },
            }
          )
        }}
      >
        <div>
          <input
            id="audio-file"
            name="audio-file"
            ref={audioInputRef}
            type="file"
            disabled={epubUploadProgress === null}
          />
        </div>
        <Button
          disabled={epubUploadProgress === null || audioUploadProgress !== null}
          type="submit"
        >
          Upload
        </Button>
      </form>
      <div>
        {audioUploadProgress !== null && (
          <p>Uploading... {Math.floor(audioUploadProgress * 100)}%</p>
        )}
      </div>
      <Button
        type="button"
        disabled={epubUploadProgress !== 1 || audioUploadProgress !== 1}
        onClick={() => {
          if (!book) return

          client.default
            .processBookBooksBookIdProcessPost(book.id)
            .then(() => onSubmit(book))
        }}
      >
        Start processing!
      </Button>
    </>
  )
}
