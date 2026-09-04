import {
  Alert,
  Button,
  Code,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Text,
} from "@mantine/core"
import { useState } from "react"

import { MediaType } from "@storyteller-platform/media-types"

import { MetadataFieldOverridesEditor } from "@/components/settings/MetadataFieldOverridesEditor"
import { type BookWithRelations } from "@/database/books"
import {
  type ImportMode,
  type MetadataFieldOverrides,
  defaultMetadataFieldOverrides,
} from "@/database/settingsTypes"
import { useReplaceBookAssetMutation } from "@/store/api"

import { ServerFileBrowser } from "./ServerFileBrowser"

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

function isEbookFilter(entry: { name: string; isDirectory: boolean }) {
  return !entry.isDirectory && MediaType.fromPath(entry.name)?.kind === "ebook"
}

function isAudioFileFilter(entry: { name: string; isDirectory: boolean }) {
  return !entry.isDirectory && MediaType.fromPath(entry.name)?.kind === "audio"
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

  const sourceInsideAssetDir = Boolean(
    path && book.assetDir && path.includes(`/${book.assetDir}/`),
  )

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
      classNames={{
        body: "flex h-[calc(100%-60px)] flex-col",
      }}
    >
      <Stack gap="md" className="min-h-0 flex-1">
        <Text size="sm" c="dimmed">
          {format === "audiobook"
            ? "Pick a directory containing audio files, or click an audio file to select its parent directory."
            : "Pick a .epub file on the server."}
        </Text>

        <ServerFileBrowser
          startPath={currentPath}
          fileFilter={
            format === "audiobook" ? isAudioFileFilter : isEbookFilter
          }
          onSelect={setPath}
          selectLabel={
            format === "audiobook" ? "Use this directory" : undefined
          }
          className="min-h-0 flex-1"
        />

        {path && (
          <Text size="xs" c="dimmed" className="break-all">
            Selected: <Code>{path}</Code>
          </Text>
        )}
      </Stack>

      <div className="sticky bottom-0 -mx-4 mt-2 -mb-4 border-t bg-white px-4 py-3 dark:border-neutral-500 dark:bg-neutral-800">
        <Stack gap="xs">
          <Group gap="md" wrap="wrap">
            <NativeSelect
              size="sm"
              label="Import mode"
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
          </Group>

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

          {!isAdd && (
            <Text size="xs" c="dimmed">
              Replace will delete the current {FORMAT_LABELS[format]} files in
              this book&apos;s asset folder before importing the new source.
            </Text>
          )}
          {sourceInsideAssetDir && (
            <Alert color="orange">
              The selected path is inside this book&apos;s asset folder. The
              replace would delete the source before reading it. Pick a path
              outside the library.
            </Alert>
          )}
          {error && <Alert color="red">{error}</Alert>}

          <Group justify="space-between">
            <Button variant="subtle" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              loading={isLoading}
              disabled={sourceInsideAssetDir}
            >
              {isAdd ? "Import" : "Replace"}
            </Button>
          </Group>
        </Stack>
      </div>
    </Modal>
  )
}
