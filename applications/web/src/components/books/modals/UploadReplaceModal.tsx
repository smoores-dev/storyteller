import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  useComputedColorScheme,
} from "@mantine/core"
import Uppy, { type Meta, type UppyFile } from "@uppy/core"
import "@uppy/core/dist/style.min.css"
import "@uppy/dashboard/dist/style.min.css"
import Dashboard from "@uppy/react/lib/Dashboard"
import useUppyEvent from "@uppy/react/lib/useUppyEvent"
import useUppyState from "@uppy/react/lib/useUppyState"
import Tus from "@uppy/tus"
import { useEffect, useMemo, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { MetadataFieldOverridesEditor } from "@/components/settings/MetadataFieldOverridesEditor"
import { type BookWithRelations } from "@/database/books"
import {
  type MetadataFieldOverrides,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import { useGetMaxUploadChunkSizeQuery } from "@/store/api"
import { audioFileTypes, epubFileTypes } from "@/uploadFileTypes"

type Format = "ebook" | "audiobook" | "readaloud"

const FORMAT_LABELS: Record<Format, string> = {
  ebook: "ebook",
  audiobook: "audiobook",
  readaloud: "readaloud",
}

function tusEndpointForBook(bookUuid: string) {
  const path = `/api/v2/books/${bookUuid}/replace-asset/upload`

  if (typeof window === "undefined") return path

  return new URL(path, window.location.origin).toString()
}

function fileTypesForFormat(format: Format) {
  if (format === "audiobook") return audioFileTypes
  return epubFileTypes
}

function dashboardDropText(format: Format) {
  if (format === "audiobook") {
    return "Drop audio files here, %{browseFiles} or %{browseFolders}"
  }

  return `Drop .epub file here or %{browseFiles}`
}

interface Props {
  isOpen: boolean
  onClose: () => void
  book: BookWithRelations
  format: Format
}

export function UploadReplaceModal({ isOpen, onClose, book, format }: Props) {
  const { data, isLoading } = useGetMaxUploadChunkSizeQuery()
  const maxUploadChunkSize = data?.maxUploadChunkSize

  const isAdd = !book[format]?.filepath
  const [isComplete, setIsComplete] = useState(false)
  const [failedCount, setFailedCount] = useState(0)
  const [isFinalizing, setIsFinalizing] = useState(false)

  const [overrides, setOverrides] = useState<MetadataFieldOverrides>(() =>
    defaultMetadataFieldOverrides("merge"),
  )
  const tusEndpoint = tusEndpointForBook(book.uuid)

  const [uppy, setUppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles: format === "audiobook" ? null : 1,
        allowedFileTypes: fileTypesForFormat(format),
      },
    }).use(Tus, {
      endpoint: tusEndpoint,
      withCredentials: true,
      ...(maxUploadChunkSize && { chunkSize: maxUploadChunkSize }),
    }),
  )

  useEffect(() => {
    if (!isLoading) {
      setUppy(
        new Uppy({
          restrictions: {
            maxNumberOfFiles: format === "audiobook" ? null : 1,
            allowedFileTypes: fileTypesForFormat(format),
          },
        }).use(Tus, {
          endpoint: tusEndpoint,
          withCredentials: true,
          ...(maxUploadChunkSize && { chunkSize: maxUploadChunkSize }),
        }),
      )
    }
  }, [isLoading, maxUploadChunkSize, tusEndpoint, format])

  useUppyEvent(uppy, "complete", (result) => {
    setIsComplete(true)
    setFailedCount(result.failed?.length ?? 0)
  })

  const filesRecord = useUppyState(uppy, (state) => state.files)
  const files = useMemo(() => Object.values(filesRecord), [filesRecord])

  function reset() {
    uppy.clear()
    setIsComplete(false)
    setFailedCount(0)
    setIsFinalizing(false)
    setOverrides(defaultMetadataFieldOverrides("merge"))
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleUpload() {
    if (isComplete) {
      reset()
      return
    }

    const batchId = uuidv4()
    const totalAudio = format === "audiobook" ? uppy.getFiles().length : 0

    function addFileMeta(file: UppyFile<Meta, Record<string, unknown>>) {
      file.meta["bookUuid"] = book.uuid
      file.meta["format"] = format
      file.meta["metadataFieldOverrides"] = JSON.stringify(overrides)
      // cant just scope things by uuid bc book alredy exists, need new identifier
      file.meta["batchId"] = batchId

      if (format === "audiobook") {
        // server uses these to defer scan() until every track in this batch
        file.meta["totalAudioFiles"] = String(totalAudio)
      }
    }

    uppy.getFiles().forEach(addFileMeta)

    uppy.upload().catch((e: unknown) => {
      console.error(e)
    })
  }

  async function finalize() {
    setIsFinalizing(true)
    try {
      const response = await fetch(
        `/api/v2/books/${book.uuid}/replace-asset/upload/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metadataFieldOverrides: overrides }),
        },
      )
      if (!response.ok) {
        console.error("Finalize failed", response.status)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsFinalizing(false)
    }
  }

  const computedColorScheme = useComputedColorScheme()

  const title = isAdd
    ? `Upload ${FORMAT_LABELS[format]}`
    : `Upload replacement ${FORMAT_LABELS[format]}`

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title={title}
      centered
      size="lg"
      classNames={{ body: "flex flex-col gap-4" }}
    >
      <Text size="sm" c="dimmed">
        {format === "audiobook"
          ? `Upload audio files from your device. They will be placed in the book's audiobook directory.${!isAdd ? " Existing tracks will be replaced." : ""}`
          : `Upload a .epub file from your device to ${isAdd ? "add" : "replace"} the book's ${FORMAT_LABELS[format]}.`}
      </Text>

      <Dashboard
        id={`ReplaceUpload-${format}`}
        uppy={uppy}
        height={format === "audiobook" ? 300 : 160}
        showProgressDetails
        theme={computedColorScheme}
        hideUploadButton
        singleFileFullScreen={format !== "audiobook"}
        proudlyDisplayPoweredByUppy={false}
        disableThumbnailGenerator
        fileManagerSelectionType={format === "audiobook" ? "both" : "files"}
        locale={{
          // @ts-expect-error This is typed incorrectly -- partials are fine
          strings: {
            [format === "audiobook" ? "dropPasteBoth" : "dropPasteFiles"]:
              dashboardDropText(format),
          },
        }}
      />

      <Stack gap={4}>
        <Group justify="space-between" align="center">
          <Text fw={500} size="sm">
            Metadata behavior
          </Text>
        </Group>
        <MetadataFieldOverridesEditor
          value={overrides}
          onChange={setOverrides}
          title=""
        />
      </Stack>

      <Group justify="space-between">
        <Button variant="subtle" onClick={handleClose}>
          Cancel
        </Button>
        <Button disabled={!files.length} onClick={handleUpload}>
          {isComplete ? "Done! Upload another?" : "Upload"}
        </Button>
      </Group>
      {isComplete && format === "audiobook" && failedCount > 0 && (
        <Button
          variant="light"
          loading={isFinalizing}
          onClick={() => {
            void finalize()
          }}
        >
          {failedCount} audio file{failedCount === 1 ? "" : "s"} failed to
          upload — process the rest anyway
        </Button>
      )}
    </Modal>
  )
}
