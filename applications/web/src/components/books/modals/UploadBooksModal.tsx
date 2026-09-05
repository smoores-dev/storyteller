import { Button, Modal, Text, useComputedColorScheme } from "@mantine/core"
import Uppy, { type Meta, type UppyFile } from "@uppy/core"
import "@uppy/core/dist/style.min.css"
import "@uppy/dashboard/dist/style.min.css"
import Dashboard from "@uppy/react/lib/Dashboard"
import useUppyEvent from "@uppy/react/lib/useUppyEvent"
import useUppyState from "@uppy/react/lib/useUppyState"
import Tus from "@uppy/tus"
import { parseBlob, selectCover } from "music-metadata"
import { useEffect, useMemo, useState } from "react"
import { v4 as uuidv4 } from "uuid"

import { MediaType } from "@storyteller-platform/media-types"

import { type Collection } from "@/database/collections"
import { useGetMaxUploadChunkSizeQuery } from "@/store/api"
import {
  audioFileTypes,
  audioOnlyAccept,
  epubFileTypes,
} from "@/uploadFileTypes"
import BookThumbnailGenerator from "@/uppyPlugins/BookThumbnailGenerator/BookThumbnailGenerator"

const tusEndpoint =
  typeof window === "undefined"
    ? "/api/v2/books/upload"
    : new URL("/api/v2/books/upload", window.location.origin).toString()

interface Props {
  isOpen: boolean
  onClose: () => void
  collection?: Collection | undefined
}

export function UploadBooksModal({ isOpen, onClose, collection }: Props) {
  const { data, isLoading } = useGetMaxUploadChunkSizeQuery()
  const [isEpubAligned, setIsEpubAligned] = useState(false)
  const [isEpubComplete, setIsEpubComplete] = useState(false)
  const [isAudioComplete, setIsAudioComplete] = useState(false)
  // tracked separately from uppy state because uppy clears it on reset; we
  // need them after upload finishes to enable the manual finalize button.
  const [currentBookUuid, setCurrentBookUuid] = useState<string | null>(null)
  const [audioFailedCount, setAudioFailedCount] = useState(0)
  const [isFinalizing, setIsFinalizing] = useState(false)

  const maxUploadChunkSize = data?.maxUploadChunkSize

  const [epubUppy, setEpubUppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles: 1,
        allowedFileTypes: epubFileTypes,
      },
    }).use(Tus, {
      endpoint: tusEndpoint,
      withCredentials: true,
      ...(maxUploadChunkSize && { chunkSize: maxUploadChunkSize }),
    }),
  )

  useEffect(() => {
    if (!isLoading) {
      setEpubUppy(
        new Uppy({
          restrictions: {
            maxNumberOfFiles: 1,
            allowedFileTypes: epubFileTypes,
          },
        }).use(Tus, {
          endpoint: tusEndpoint,
          withCredentials: true,
          ...(maxUploadChunkSize && { chunkSize: maxUploadChunkSize }),
        }),
      )
    }
  }, [isLoading, maxUploadChunkSize])

  const [audioUppy, setAudioUppy] = useState(() =>
    new Uppy({
      restrictions: {
        allowedFileTypes: audioFileTypes,
      },
    })
      .use(Tus, {
        endpoint: tusEndpoint,
        withCredentials: true,
        ...(maxUploadChunkSize && { chunkSize: maxUploadChunkSize }),
      })
      .use(BookThumbnailGenerator, {
        thumbnailFactories: {
          [audioOnlyAccept]: async (file) => {
            const { common } = await parseBlob(file.data)
            const coverImage = selectCover(common.picture)
            if (!coverImage) return null

            return new Blob([new Uint8Array(coverImage.data)])
          },
        },
      }),
  )

  useEffect(() => {
    if (!isLoading) {
      setAudioUppy(
        new Uppy({
          restrictions: {
            allowedFileTypes: audioFileTypes,
          },
        })
          .use(Tus, {
            endpoint: tusEndpoint,
            withCredentials: true,
            ...(maxUploadChunkSize && { chunkSize: maxUploadChunkSize }),
          })
          .use(BookThumbnailGenerator, {
            thumbnailFactories: {
              [audioOnlyAccept]: async (file) => {
                const { common } = await parseBlob(file.data)
                const coverImage = selectCover(common.picture)
                if (!coverImage) return null

                return new Blob([new Uint8Array(coverImage.data)])
              },
            },
          }),
      )
    }
  }, [isLoading, maxUploadChunkSize])

  // useUppyEvent(epubUppy, "file-added", async (file) => {
  //   const arrayBuffer = await file.data.arrayBuffer()
  //   const data = new Uint8Array(arrayBuffer)
  //   using epub = await Epub.from(data)
  //   const manifest = await epub.getManifest()
  //   const isAligned = Object.values(manifest).some((item) => item.mediaOverlay)
  //   setIsEpubAligned(isAligned)
  //   if (isAligned) audioUppy.clear()
  // })

  useUppyEvent(epubUppy, "file-removed", () => {
    setIsEpubAligned(false)
  })

  useUppyEvent(epubUppy, "complete", () => {
    setIsEpubComplete(true)
  })

  useUppyEvent(audioUppy, "complete", (result) => {
    setIsAudioComplete(true)
    setAudioFailedCount(result.failed?.length ?? 0)
  })

  const epubFilesRecord = useUppyState(epubUppy, (state) => state.files)
  const epubFiles = useMemo(
    () => Object.values(epubFilesRecord),
    [epubFilesRecord],
  )
  const audioFilesRecord = useUppyState(audioUppy, (state) => state.files)
  const audioFiles = useMemo(
    () => Object.values(audioFilesRecord),
    [audioFilesRecord],
  )

  function reset() {
    epubUppy.clear()
    audioUppy.clear()
    setIsEpubComplete(false)
    setIsAudioComplete(false)
    setIsEpubAligned(false)
    setCurrentBookUuid(null)
    setAudioFailedCount(0)
    setIsFinalizing(false)
  }

  async function finalizeAudiobook() {
    if (!currentBookUuid) return
    setIsFinalizing(true)
    try {
      const response = await fetch("/api/v2/books/upload/finalize", {
        method: "POST",
        headers: { "Content-Type": MediaType.JSON.mime },
        body: JSON.stringify({
          bookUuid: currentBookUuid,
          ...(collection && { collectionUuid: collection.uuid }),
        }),
      })
      if (!response.ok) {
        console.error("Finalize failed", response.status)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsFinalizing(false)
    }
  }

  const complete = isEpubComplete && isAudioComplete

  const computedColorScheme = useComputedColorScheme()

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Upload book"
      centered
      classNames={{
        body: "flex flex-col gap-4",
      }}
    >
      {/* <p>Upload an EPUB file or a set of audio files for an audiobook</p>
      <FileButton
        accept={MediaType.EPUB.mime}
        {...form.getInputProps("epubFile")}
      >
        {(props) => <Button {...props}>Choose file...</Button>}
      </FileButton> */}
      <Text className="text-xs">
        EPUB 2 files are automatically converted to EPUB 3 during upload.
      </Text>
      <Dashboard
        id="EbookDashboard"
        uppy={epubUppy}
        height={122}
        showProgressDetails
        theme={computedColorScheme}
        hideUploadButton
        singleFileFullScreen
        proudlyDisplayPoweredByUppy={false}
        disableThumbnailGenerator
        fileManagerSelectionType="files"
        locale={{
          // @ts-expect-error This is typed incorrectly — partials are fine
          strings: {
            dropPasteFiles:
              "Drop EPUB files (plain or with immersive reading) here or %{browseFiles}",
          },
        }}
      />

      {isEpubAligned && (
        <Text className="text-center">
          This EPUB file already has audio for immersive reading, so you
          don&apos;t need to upload the audio separately!
        </Text>
      )}
      <Dashboard
        id="AudiobookDashboard"
        disabled={isEpubAligned}
        theme={computedColorScheme}
        uppy={audioUppy}
        height={300}
        showProgressDetails
        hideUploadButton
        singleFileFullScreen={false}
        proudlyDisplayPoweredByUppy={false}
        disableThumbnailGenerator
        fileManagerSelectionType="both"
        locale={{
          // @ts-expect-error This is typed incorrectly — partials are fine
          strings: {
            dropPasteBoth:
              "Drop audio files here, %{browseFiles} or %{browseFolders}",
          },
        }}
      />

      <Button
        disabled={!epubFiles.length && !audioFiles.length}
        onClick={() => {
          if (complete) {
            reset()
            return
          }

          const bookUuid = uuidv4()
          setCurrentBookUuid(bookUuid)
          const totalAudio = audioUppy.getFiles().length

          function addFileMeta(file: UppyFile<Meta, Record<string, unknown>>) {
            file.meta["bookUuid"] = bookUuid
            if (collection) {
              file.meta["collection"] = collection.uuid
            }
          }

          epubUppy.getFiles().forEach(addFileMeta)
          audioUppy.getFiles().forEach((file) => {
            addFileMeta(file)
            // server uses this to defer scan() until all audio files have
            // landed in UPLOADS_DIR; without it move-mode relocate strands
            // late arrivals.
            file.meta["totalAudioFiles"] = String(totalAudio)
          })

          epubUppy.upload().catch((e: unknown) => {
            console.error(e)
          })
          audioUppy.upload().catch((e: unknown) => {
            console.error(e)
          })
        }}
      >
        {complete ? "Done! Upload another?" : "Upload"}
      </Button>
      {complete && audioFailedCount > 0 && currentBookUuid && (
        <Button
          variant="light"
          loading={isFinalizing}
          onClick={() => {
            void finalizeAudiobook()
          }}
        >
          {audioFailedCount} audio file
          {audioFailedCount === 1 ? "" : "s"} failed to upload — process the
          rest anyway
        </Button>
      )}
    </Modal>
  )
}
