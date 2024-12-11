"use client"

import { Button, Dialog, DialogDismiss, DialogHeading } from "@ariakit/react"
import { useCallback, useState, MouseEvent } from "react"
import styles from "./addbookform.module.css"
import { useApiClient } from "@/hooks/useApiClient"
import { ProgressBar } from "./ProgressBar"
import { usePermission } from "@/contexts/UserPermissions"
import cx from "classnames"
import { ServerFilePicker } from "./ServerFilePicker"

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

export function AddBookForm() {
  const [fileSource, setFileSource] = useState<"upload" | "server">("upload")
  const [openDialog, setOpenDialog] = useState<"epub" | "audio" | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [epubFile, setEpubFile] = useState<File | null>(null)
  const [audioFiles, setAudioFiles] = useState<FileList | null>(null)
  const [epubPath, setEpubPath] = useState<string | null>(null)
  const [audioPaths, setAudioPaths] = useState<string[] | null>(null)
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
    setEpubPath(null)
    setAudioPaths(null)
    setCurrentUploadIndex(null)
    setUploadProgress(null)
    setUploadState(UploadState.CLEAN)
  }, [])

  const client = useApiClient()

  const canAddBook = usePermission("book_create")

  if (!canAddBook) return null

  return (
    <div className={styles["container"]}>
      <Dialog
        className={styles["server-files-dialog"]}
        open={fileSource === "server" && openDialog !== null}
        unmountOnHide
        hideOnEscape
        hideOnInteractOutside
        onClose={() => {
          setOpenDialog(null)
        }}
      >
        <DialogDismiss className={styles["dialog-dismiss"]} />
        <DialogHeading>
          Choose {openDialog === "epub" ? "file" : "files"} from server
        </DialogHeading>
        {openDialog === "audio" ? (
          <ServerFilePicker
            allowedExtensions={[".mp4", ".mp3", ".zip", ".m4b", ".m4a"]}
            multiple
            onChange={(files) => {
              setAudioPaths(files)
              setOpenDialog(null)
            }}
          />
        ) : (
          <ServerFilePicker
            allowedExtensions={[".epub"]}
            onChange={(file) => {
              setEpubPath(file)
              setOpenDialog(null)
            }}
          />
        )}
      </Dialog>
      {showForm ? (
        <form className={styles["form"]}>
          <div className={styles["file-source-buttons"]}>
            <Button
              className={cx(
                styles["file-source-upload"],
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                { [styles["selected-file-source"]!]: fileSource === "upload" },
              )}
              onClick={() => {
                setFileSource("upload")
              }}
            >
              Upload files
            </Button>
            <Button
              className={cx(
                styles["file-source-server"],
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                { [styles["selected-file-source"]!]: fileSource === "server" },
              )}
              onClick={() => {
                setFileSource("server")
              }}
            >
              Choose from server
            </Button>
          </div>
          <fieldset className={styles["fields"]}>
            <div>
              {fileSource === "upload" ? (
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
              ) : (
                <Button
                  className={styles["server-file-button"]}
                  onClick={() => {
                    setOpenDialog("epub")
                  }}
                >
                  EPUB file
                </Button>
              )}
              {epubFile !== null && `1 file (${formatBytes(epubFile.size)})`}
              {epubPath !== null && `1 file`}
            </div>
            <div>
              {fileSource === "upload" ? (
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
              ) : (
                <Button
                  className={styles["server-file-button"]}
                  onClick={() => {
                    setOpenDialog("audio")
                  }}
                >
                  Audio files
                </Button>
              )}
              {audioFiles !== null &&
                `${audioFiles.length} files (${formatBytes(Array.from(audioFiles).reduce((acc, f) => acc + f.size, 0))})`}
              {audioPaths !== null && `${audioPaths.length} files`}
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
                    (fileSource === "upload" &&
                      (epubFile === null || audioFiles === null)) ||
                    (fileSource === "server" &&
                      (epubPath === null || audioPaths === null)) ||
                    uploadState !== UploadState.CLEAN
                  }
                  onClick={async (e) => {
                    e.preventDefault()

                    setUploadState(UploadState.UPLOADING)
                    if (fileSource === "upload") {
                      if (epubFile === null || audioFiles === null) return
                      try {
                        await client.createBook(
                          epubFile,
                          audioFiles,
                          (event) => {
                            if (event.progress === 1) {
                              setCurrentUploadIndex((p) =>
                                p === null ? 0 : p + 1,
                              )
                            }
                            setUploadProgress(event.progress ?? null)
                          },
                        )
                      } catch (_) {
                        setUploadState(UploadState.ERROR)
                        return
                      }
                    } else {
                      try {
                        if (epubPath === null || audioPaths === null) return
                        await client.createBook(epubPath, audioPaths)
                      } catch (_) {
                        setUploadState(UploadState.ERROR)
                        return
                      }
                    }

                    setUploadState(UploadState.SUCCESS)
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
