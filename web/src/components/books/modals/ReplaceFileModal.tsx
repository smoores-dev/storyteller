import {
  Alert,
  Button,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Text,
} from "@mantine/core"
import { useState } from "react"

import { MetadataFieldOverridesEditor } from "@/components/settings/MetadataFieldOverridesEditor"
import { type BookWithRelations } from "@/database/books"
import {
  type ImportMode,
  type MetadataFieldOverrides,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import { useReplaceBookAssetMutation } from "@/store/api"

import { ServerFilePicker } from "./ServerFilePicker"

type Format = "ebook" | "audiobook" | "readaloud"

const FORMAT_LABELS: Record<Format, string> = {
  ebook: "ebook",
  audiobook: "audiobook",
  readaloud: "readaloud",
}

const IMPORT_MODE_OPTIONS: { value: ImportMode; label: string }[] = [
  { value: "reference", label: "Reference in place" },
  { value: "copy", label: "Copy to library" },
  { value: "move", label: "Move to library" },
  { value: "hardlink", label: "Hard link to library" },
]

// TODO: put in shared place
// from src/audio.ts
const MP3_FILE_EXTENSIONS = [".mp3"]
const MPEG4_FILE_EXTENSIONS = [".mp4", ".m4a", ".m4b"]
const AAC_FILE_EXTENSIONS = [".aac"]
const OGG_FILE_EXTENSIONS = [".ogg", ".oga", ".mogg"]
const OPUS_FILE_EXTENSIONS = [".opus"]
const WAVE_FILE_EXTENSIONS = [".wav"]
const AIFF_FILE_EXTENSIONS = [".aiff"]
const FLAC_FILE_EXTENSIONS = [".flac"]
const ALAC_FILE_EXTENSIONS = [".alac"]
const WEBM_FILE_EXTENSIONS = [".weba"]

const AUDIO_FILE_EXTENSIONS = [
  ...MP3_FILE_EXTENSIONS,
  ...AAC_FILE_EXTENSIONS,
  ...MPEG4_FILE_EXTENSIONS,
  ...OPUS_FILE_EXTENSIONS,
  ...OGG_FILE_EXTENSIONS,
  ...WAVE_FILE_EXTENSIONS,
  ...AIFF_FILE_EXTENSIONS,
  ...FLAC_FILE_EXTENSIONS,
  ...ALAC_FILE_EXTENSIONS,
  ...WEBM_FILE_EXTENSIONS,
]

function isEbookFilter(entry: { name: string; isDirectory: boolean }) {
  return !entry.isDirectory && entry.name.toLowerCase().endsWith(".epub")
}

function isAudioFileFilter(entry: { name: string; isDirectory: boolean }) {
  return (
    !entry.isDirectory &&
    AUDIO_FILE_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))
  )
}

function siblingDir(book: BookWithRelations, format: Format): string {
  const others: Format[] = (
    ["ebook", "audiobook", "readaloud"] as const
  ).filter((f) => f !== format)

  for (const f of others) {
    const filepath = book[f]?.filepath
    if (!filepath) continue

    const i = filepath.lastIndexOf("/")
    return i === -1 ? "" : filepath.slice(0, i + 1)
  }

  return ""
}

interface Props {
  isOpen: boolean
  onClose: () => void
  book: BookWithRelations
  format: Format
}

export function ReplaceFileModal({ isOpen, onClose, book, format }: Props) {
  const [replaceAsset, { isLoading }] = useReplaceBookAssetMutation()

  const currentPath = book[format]?.filepath ?? siblingDir(book, format)
  const isAdd = !book[format]?.filepath
  const [path, setPath] = useState(currentPath)
  const [importMode, setImportMode] = useState<ImportMode>("reference")
  const [overrides, setOverrides] = useState<MetadataFieldOverrides>(() =>
    defaultMetadataFieldOverrides("merge"),
  )
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)

    if (!path) {
      setError("Pick a file or directory")
      return
    }

    try {
      let finalPath = path

      if (format === "audiobook") {
        const dirName = path.replace(/(\/|\\)[^/\\]*?$/, "$1")
        finalPath = dirName
      }

      await replaceAsset({
        uuid: book.uuid,
        format,
        path: finalPath,
        importMode,
        metadataFieldOverrides: overrides,
      }).unwrap()

      onClose()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to replace file. Check server logs.",
      )
    }
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        isAdd
          ? `Import ${FORMAT_LABELS[format]} from server`
          : `Replace ${FORMAT_LABELS[format]} from server`
      }
      centered
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {format === "audiobook"
            ? "Pick a directory containing audio files. Files will be brought into the library according to the selected import mode."
            : "Pick a .epub file on the server. It will be brought into the library according to the selected import mode."}
        </Text>

        <Stack gap={2}>
          <Text fw={500} size="sm">
            New file location
          </Text>
          <ServerFilePicker
            startPath={path}
            onChange={setPath}
            fileFilter={
              format === "audiobook" ? isAudioFileFilter : isEbookFilter
            }
            saveLabel="Use this path"
          />
          {path && (
            <Text size="xs" c="dimmed" mt={4} className="break-all">
              Selected: {path}
            </Text>
          )}
        </Stack>

        <Stack gap={4}>
          <Text fw={500} size="sm">
            Import mode
          </Text>
          <NativeSelect
            size="sm"
            value={importMode}
            onChange={(event) => {
              setImportMode(event.currentTarget.value as ImportMode)
            }}
            style={{ maxWidth: 240 }}
          >
            {IMPORT_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </NativeSelect>
        </Stack>

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

        {error && <Alert color="red">{error}</Alert>}

        <Group justify="space-between">
          <Button variant="subtle" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} loading={isLoading}>
            {isAdd ? "Import" : "Replace"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
