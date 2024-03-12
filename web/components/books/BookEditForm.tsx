"use client"

import { TabProvider, TabList, Tab, TabPanel, Button } from "@ariakit/react"
import { DeleteIcon } from "../icons/DeleteIcon"
import { SaveIcon } from "../icons/SaveIcon"
import styles from "./bookeditform.module.css"
import Image from "next/image"
import { BookDetail } from "@/apiModels"
import { useApiClient } from "@/hooks/useApiClient"
import { useState } from "react"

type Props = {
  book: BookDetail
}

enum SaveState {
  CLEAN = "CLEAN",
  LOADING = "LOADING",
  SAVED = "SAVED",
  ERROR = "ERROR",
}

export function BookEditForm({ book }: Props) {
  const [title, setTitle] = useState(book.title)
  const [authors, setAuthors] = useState(book.authors)
  const [textCover, setTextCover] = useState<File | null>(null)
  const [audioCover, setAudioCover] = useState<File | null>(null)

  const [savedState, setSavedState] = useState<SaveState>(SaveState.CLEAN)

  const client = useApiClient()

  return (
    <>
      {savedState === SaveState.SAVED && <p>Saved!</p>}
      {savedState === SaveState.ERROR && (
        <p>Failed to update. Check your server logs for details.</p>
      )}
      <form
        id="book-details"
        className={styles["form"]}
        action="/api/files/"
        method="POST"
      >
        <div>
          <div className={styles["cover-art-wrapper"]}>
            <TabProvider defaultSelectedId="text-cover-tab">
              <TabList className={styles["cover-art-tab-list"]}>
                <Tab
                  className={styles["text-cover-art-tab"]}
                  id="text-cover-tab"
                >
                  Text
                </Tab>
                <Tab className={styles["audio-cover-art-tab"]}>Audio</Tab>
              </TabList>
              <TabPanel tabId="text-cover-tab">
                <label className={styles["cover-art-label"]}>
                  <Image
                    className={styles["cover-art"]}
                    height={98 * 3}
                    width={64 * 3}
                    src={
                      textCover
                        ? URL.createObjectURL(textCover)
                        : client.getCoverUrl(book.uuid)
                    }
                    alt=""
                    aria-hidden
                  />
                  <span className={styles["cover-art-text"]}>
                    Edit cover art
                  </span>
                  <input
                    className={styles["cover-art-input"]}
                    id="text-cover-art"
                    name="text-cover-art"
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setTextCover(file)
                    }}
                  />
                </label>
              </TabPanel>
              <TabPanel>
                <label className={styles["cover-art-label"]}>
                  <Image
                    className={styles["cover-art"]}
                    height={64 * 3}
                    width={64 * 3}
                    src={
                      audioCover
                        ? URL.createObjectURL(audioCover)
                        : client.getCoverUrl(book.uuid, true)
                    }
                    alt=""
                    aria-hidden
                  />
                  <span className={styles["cover-art-text"]}>
                    Edit audio cover art
                  </span>
                  <input
                    className={styles["cover-art-input"]}
                    id="audio-cover-art"
                    name="audio-cover-art"
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setAudioCover(file)
                    }}
                  />
                </label>
              </TabPanel>
            </TabProvider>
          </div>
        </div>
        <div className={styles["text-inputs"]}>
          <Button
            className={styles["icon-button"]}
            form="book-details"
            type="submit"
            disabled={savedState === SaveState.LOADING}
            onClick={async (e) => {
              e.preventDefault()

              setSavedState(SaveState.LOADING)
              try {
                await client.updateBook(
                  book.uuid,
                  title,
                  authors,
                  textCover,
                  audioCover,
                )
              } catch (_) {
                setSavedState(SaveState.ERROR)
                return
              }

              setSavedState(SaveState.SAVED)
            }}
          >
            <SaveIcon />
            <span>Save</span>
          </Button>
          <label className={styles["label"]}>
            Title
            <input
              className={styles["input"]}
              id="title"
              name="title"
              type="text"
              value={title}
              onChange={(e) => {
                const value = e.target.value
                setTitle(value)
              }}
            />
          </label>
          <fieldset className={styles["fieldset"]}>
            <legend>Authors</legend>
            {authors.map((author, i) => (
              <div key={author.uuid} className={styles["authors-input"]}>
                <input
                  key={author.uuid}
                  className={styles["input"]}
                  aria-label="Author name"
                  id={`author-${author.uuid}`}
                  name={`author-${author.uuid}`}
                  type="text"
                  value={author.name}
                  onChange={(e) => {
                    const value = e.target.value
                    const newAuthors = [...authors]
                    newAuthors[i]!.name = value
                    newAuthors[i]!.file_as = value
                    setAuthors(newAuthors)
                  }}
                />
                {i > 0 && (
                  <Button
                    className={styles["delete-button"]}
                    onClick={() => {
                      const newAuthors = [...authors]
                      newAuthors.splice(i, 1)
                      setAuthors(newAuthors)
                    }}
                  >
                    <DeleteIcon />
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button
              className={styles["button"]}
              onClick={() => {
                setAuthors([
                  ...authors,
                  { name: "", role: "Author", uuid: "", file_as: "" },
                ])
              }}
            >
              + Add author
            </Button>
          </fieldset>
        </div>
      </form>
    </>
  )
}
