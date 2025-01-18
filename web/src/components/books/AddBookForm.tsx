"use client"

import { useCallback, useState, MouseEvent, FormEvent, Fragment } from "react"
import { useApiClient } from "@/hooks/useApiClient"
import { usePermission } from "@/contexts/UserPermissions"
import { ServerFilePicker } from "./ServerFilePicker"
import {
  Box,
  Button,
  ButtonGroup,
  Fieldset,
  FileButton,
  Group,
  Modal,
  Progress,
  Stack,
  Text,
} from "@mantine/core"
import { IconX } from "@tabler/icons-react"
import { formatBytes } from "@/strings"
import { DirectoryFileEntry } from "@/actions/listDirectoryAction"

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
  const [audioFiles, setAudioFiles] = useState<File[] | null>(null)
  const [epubPath, setEpubPath] = useState<DirectoryFileEntry | null>(null)
  const [audioPaths, setAudioPaths] = useState<DirectoryFileEntry[] | null>(
    null,
  )
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setUploadState(UploadState.UPLOADING)
    if (fileSource === "upload") {
      if (epubFile === null || audioFiles === null) return
      try {
        await client.createBook(epubFile, audioFiles, (event) => {
          if (event.progress === 1) {
            setCurrentUploadIndex((p) => (p === null ? 0 : p + 1))
          }
          setUploadProgress(event.progress ?? null)
        })
      } catch (_) {
        setUploadState(UploadState.ERROR)
        return
      }
    } else {
      try {
        if (epubPath === null || audioPaths === null) return
        await client.createBook(
          epubPath.path,
          audioPaths.map((entry) => entry.path),
        )
      } catch (_) {
        setUploadState(UploadState.ERROR)
        return
      }
    }

    setUploadState(UploadState.SUCCESS)
  }

  const canAddBook = usePermission("book_create")

  if (!canAddBook) return null

  return (
    <Stack className="mt-8 max-w-[600px] rounded-md bg-gray-200 py-8">
      <Modal
        opened={fileSource === "server" && openDialog !== null}
        onClose={() => {
          setOpenDialog(null)
        }}
        title="Select files"
        centered
        size="xl"
      >
        {openDialog === "audio" ? (
          <ServerFilePicker
            accept="application/zip,audio/*,video/*,.m4b"
            multiple
            onChange={(files) => {
              setAudioPaths(files)
              setOpenDialog(null)
            }}
          />
        ) : (
          <ServerFilePicker
            accept="application/epub+zip"
            onChange={(file) => {
              setEpubPath(file)
              setOpenDialog(null)
            }}
          />
        )}
      </Modal>
      {showForm ? (
        <form onSubmit={onSubmit}>
          <Group justify="center">
            <ButtonGroup>
              <Button
                variant={fileSource === "upload" ? "filled" : "white"}
                onClick={() => {
                  setEpubPath(null)
                  setAudioPaths(null)
                  setFileSource("upload")
                }}
              >
                Upload files
              </Button>
              <Button
                variant={fileSource === "server" ? "filled" : "white"}
                onClick={() => {
                  setEpubFile(null)
                  setAudioFiles(null)
                  setFileSource("server")
                }}
              >
                Choose from server
              </Button>
            </ButtonGroup>
          </Group>
          <Fieldset variant="unstyled">
            <Stack justify="space-around">
              <Stack align="center">
                {fileSource === "upload" ? (
                  <FileButton
                    accept="application/epub+zip"
                    onChange={(file) => {
                      setEpubFile(file)
                    }}
                  >
                    {(props) => (
                      <Button variant="default" {...props}>
                        EPUB file
                      </Button>
                    )}
                  </FileButton>
                ) : (
                  <Button
                    variant="default"
                    onClick={() => {
                      setOpenDialog("epub")
                    }}
                  >
                    EPUB file
                  </Button>
                )}
                {epubFile !== null && (
                  <Group>
                    <Text>{epubFile.name}</Text>
                    <Text>{formatBytes(epubFile.size)}</Text>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      onClick={() => {
                        setEpubFile(null)
                      }}
                    >
                      <IconX />
                    </Button>
                  </Group>
                )}
                {epubPath !== null && (
                  <Group>
                    <Text>{epubPath.name}</Text>
                    <Text>{formatBytes(epubPath.size)}</Text>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      onClick={() => {
                        setEpubPath(null)
                      }}
                    >
                      <IconX />
                    </Button>
                  </Group>
                )}
              </Stack>
              <Stack align="center">
                {fileSource === "upload" ? (
                  <FileButton
                    accept="application/zip,audio/*,video/*,.m4b"
                    multiple
                    onChange={(files) => {
                      setAudioFiles(files)
                    }}
                  >
                    {(props) => (
                      <Button variant="default" {...props}>
                        Audio files
                      </Button>
                    )}
                  </FileButton>
                ) : (
                  <Button
                    variant="default"
                    onClick={() => {
                      setOpenDialog("audio")
                    }}
                  >
                    Audio files
                  </Button>
                )}
                {audioFiles !== null && (
                  <>
                    <Group>
                      <Text>Total: </Text>
                      <Text>
                        {formatBytes(
                          Array.from(audioFiles).reduce(
                            (acc, f) => acc + f.size,
                            0,
                          ),
                        )}
                      </Text>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={() => {
                          setAudioFiles(null)
                        }}
                      >
                        Clear
                      </Button>
                    </Group>
                    <Stack gap={0}>
                      {audioFiles.map((file) => (
                        <Fragment key={file.name}>
                          <Group justify="stretch">
                            <Group justify="space-between" className="grow">
                              <Text>{file.name}</Text>
                              <Text>{formatBytes(file.size)}</Text>
                            </Group>
                            <Button
                              variant="subtle"
                              size="compact-xs"
                              onClick={() => {
                                setAudioFiles(
                                  (prev) =>
                                    prev?.filter((value) => value !== file) ??
                                    null,
                                )
                              }}
                            >
                              <IconX />
                            </Button>
                          </Group>
                        </Fragment>
                      ))}
                    </Stack>
                  </>
                )}
                {audioPaths !== null && (
                  <>
                    <Group>
                      <Text>Total: </Text>
                      <Text>
                        {formatBytes(
                          Array.from(audioPaths).reduce(
                            (acc, f) => acc + f.size,
                            0,
                          ),
                        )}
                      </Text>
                      <Button
                        variant="subtle"
                        size="compact-xs"
                        onClick={() => {
                          setAudioPaths(null)
                        }}
                      >
                        Clear
                      </Button>
                    </Group>
                    <Stack gap={0}>
                      {audioPaths.map((file) => (
                        <Fragment key={file.name}>
                          <Group justify="stretch">
                            <Group justify="space-between" className="grow">
                              <Text>{file.name}</Text>
                              <Text>{formatBytes(file.size)}</Text>
                            </Group>
                            <Button
                              variant="subtle"
                              size="compact-xs"
                              onClick={() => {
                                setAudioPaths(
                                  (prev) =>
                                    prev?.filter((value) => value !== file) ??
                                    null,
                                )
                              }}
                            >
                              <IconX />
                            </Button>
                          </Group>
                        </Fragment>
                      ))}
                    </Stack>
                  </>
                )}
              </Stack>
            </Stack>
          </Fieldset>
          {uploadState === UploadState.SUCCESS ? (
            <Group justify="space-between" px="lg" align="center">
              <Text size="lg" c="st-orange" fw="bold">
                Done!
              </Text>
              <Button type="reset" onClick={resetState}>
                Add another book
              </Button>
            </Group>
          ) : uploadState === UploadState.ERROR ? (
            <Group justify="space-between" px="lg">
              <Text>Failed - check your server logs for more details</Text>
              <Button type="reset" onClick={resetState}>
                Try again
              </Button>
            </Group>
          ) : (
            <>
              {uploadState === UploadState.UPLOADING &&
                uploadProgress !== null && (
                  <Box className="p-6">
                    <Text>
                      {currentUploadIndex === null
                        ? epubFile?.name
                        : audioFiles?.[currentUploadIndex]?.name ??
                          "Processing..."}
                    </Text>
                    <Progress value={uploadProgress * 100} />
                  </Box>
                )}
              <Group justify="space-between" px="lg">
                <Button type="reset" variant="white" onClick={resetState}>
                  Clear
                </Button>
                <Button
                  type="submit"
                  disabled={
                    (fileSource === "upload" &&
                      (epubFile === null || audioFiles === null)) ||
                    (fileSource === "server" &&
                      (epubPath === null || audioPaths === null)) ||
                    uploadState !== UploadState.CLEAN
                  }
                >
                  Create
                </Button>
              </Group>
            </>
          )}
        </form>
      ) : (
        <Button
          className="self-center"
          variant="white"
          onClick={() => {
            setShowForm(true)
          }}
        >
          + Add book
        </Button>
      )}
    </Stack>
  )
}
