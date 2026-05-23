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

import { MetadataFieldOverridesEditor } from "@/components/settings/MetadataFieldOverridesEditor"
import { type BookWithRelations } from "@/database/books"
import {
  type MetadataFieldOverrides,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import { useGetMaxUploadChunkSizeQuery } from "@/store/api"

type Format = "ebook" | "audiobook" | "readaloud"

const FORMAT_LABELS: Record<Format, string> = {
  ebook: "ebook",
  audiobook: "audiobook",
  readaloud: "readaloud",
}

const nav = typeof navigator != "undefined" ? navigator : null
const agent = (nav && nav.userAgent) || ""

const ie_edge = /Edge\/(\d+)/.exec(agent)
const ie_upto10 = /MSIE \d/.exec(agent)
const ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(agent)
const ie = !!(ie_upto10 || ie_11up || ie_edge)

// eslint-disable-next-line @typescript-eslint/no-deprecated
const safari = !ie && !!nav && /Apple Computer/.test(nav.vendor)
const ios = safari && (/Mobile\/\w+/.test(agent) || nav.maxTouchPoints > 2)

const epubFileTypes = ["application/epub+zip", ...(ios ? [] : [".epub"])]
const audioFileTypes = ios
  ? null
  : ["video/mp4", "audio/*", "application/zip", ".m4b", ".m4a", ".zip"]

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

  useUppyEvent(uppy, "complete", () => {
    setIsComplete(true)
  })

  const filesRecord = useUppyState(uppy, (state) => state.files)
  const files = useMemo(() => Object.values(filesRecord), [filesRecord])

  function reset() {
    uppy.clear()
    setIsComplete(false)
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

    function addFileMeta(file: UppyFile<Meta, Record<string, unknown>>) {
      file.meta["bookUuid"] = book.uuid
      file.meta["format"] = format
      file.meta["metadataFieldOverrides"] = JSON.stringify(overrides)
    }

    uppy.getFiles().forEach(addFileMeta)

    uppy.upload().catch((e: unknown) => {
      console.error(e)
    })
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
          ? "Upload audio files from your device. They will be placed in the book's audiobook directory."
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
    </Modal>
  )
}
