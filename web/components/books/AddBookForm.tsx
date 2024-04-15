"use client"

import { Button } from "@ariakit/react"
import { useCallback, useState, MouseEvent } from "react"
import styles from "./addbookform.module.css"
import { useApiClient } from "@/hooks/useApiClient"
import { ProgressBar } from "./ProgressBar"
import { usePermission } from "@/contexts/UserPermissions"

function round(n: number, r: number) {
  return Math.round(n * Math.pow(10, r)) / Math.pow(10, r)
}

function formatBytes(bytes: number) {
  const kilobytes = round(bytes / 1000, 2)
  if (kilobytes < 1) return `${bytes} B`
  const megabytes = round(kilobytes / 1000, 2)
  if (megabytes < 1) return `${kilobytes} KB`
  const gigabytes = round(megabytes / 1000, 2)
  if (gigabytes < 1) return `${megabytes} MB`
  return `${gigabytes.toFixed(2)} GB`
}

enum UploadState {
  CLEAN = "CLEAN",
  UPLOADING = "UPLOADING",
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

type Props = {
  onAdded: () => void
}

export function AddBookForm({ onAdded }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [epubFile, setEpubFile] = useState<File | null>(null)
  const [audioFiles, setAudioFiles] = useState<FileList | null>(null)
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number | null>(
    null,
  )
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>(UploadState.CLEAN)

  const resetState = useCallback((event: MouseEvent) => {
    event.preventDefault()
    setShowForm(true)
    setEpubFile(null)
    setAudioFiles(null)
    setCurrentUploadIndex(null)
    setUploadProgress(null)
    setUploadState(UploadState.CLEAN)
  }, [])

  const client = useApiClient()

  const canAddBook = usePermission("book_create")

  if (!canAddBook) return null

  return (
    <div className={styles["container"]}>
      {showForm ? (
        <form className={styles["form"]}>
          <fieldset className={styles["fields"]}>
            <div>
              <label className={styles["label"]}>
                EPUB file
                <input
                  className={styles["input"]}
                  id="epub-file"
                  name="epub-file"
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setEpubFile(file)
                  }}
                />
              </label>
              {epubFile !== null && `1 file (${formatBytes(epubFile.size)})`}
            </div>
            <div>
              <label className={styles["label"]}>
                Audio files
                <input
                  className={styles["input"]}
                  id="audio-files"
                  name="audio-files"
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files
                    if (!files?.length) return
                    setAudioFiles(files)
                  }}
                />
              </label>
              {audioFiles !== null &&
                `${audioFiles.length} files (${formatBytes(Array.from(audioFiles).reduce((acc, f) => acc + f.size, 0))})`}
            </div>
          </fieldset>
          <div className={styles["submit"]}>
            {uploadState === UploadState.SUCCESS ? (
              <>
                <span>Done!</span>
                <Button
                  type="reset"
                  className={styles["button"]}
                  onClick={resetState}
                >
                  Add another book
                </Button>
              </>
            ) : uploadState === UploadState.ERROR ? (
              <>
                <span>Failed - check your server logs for more details</span>
                <Button
                  type="reset"
                  className={styles["button"]}
                  onClick={resetState}
                >
                  Try again
                </Button>
              </>
            ) : (
              <>
                <div className={styles["progress-container"]}>
                  {uploadState === UploadState.UPLOADING &&
                    uploadProgress !== null && (
                      <>
                        <span>
                          {currentUploadIndex === null
                            ? epubFile?.name
                            : audioFiles?.[currentUploadIndex]?.name ??
                              "Processing..."}
                        </span>
                        <ProgressBar progress={uploadProgress * 100} />
                      </>
                    )}
                </div>
                <Button
                  type="submit"
                  className={styles["button"]}
                  disabled={
                    epubFile === null ||
                    audioFiles === null ||
                    uploadState !== UploadState.CLEAN
                  }
                  onClick={async (e) => {
                    e.preventDefault()
                    if (epubFile === null || audioFiles === null) return

                    setUploadState(UploadState.UPLOADING)
                    try {
                      await client.createBook(epubFile, audioFiles, (event) => {
                        if (event.progress === 1) {
                          setCurrentUploadIndex((p) => (p === null ? 0 : p + 1))
                        }
                        setUploadProgress(event.progress ?? null)
                      })
                    } catch (_) {
                      setUploadState(UploadState.ERROR)
                      onAdded()
                      return
                    }

                    setUploadState(UploadState.SUCCESS)
                    onAdded()
                  }}
                >
                  Create
                </Button>
              </>
            )}
          </div>
        </form>
      ) : (
        <Button
          className={styles["add-button"]}
          onClick={() => {
            setShowForm(true)
          }}
        >
          + Add book
        </Button>
      )}
    </div>
  )
}
