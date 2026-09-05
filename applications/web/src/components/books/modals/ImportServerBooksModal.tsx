import { Button, Group, Modal, NativeSelect, Stack, Text } from "@mantine/core"
import { useState } from "react"

import { type DirectoryFileEntry } from "@/actions/listDirectoryAction"
import { type Collection } from "@/database/collections"
import {
  type Epub2ImportStrategy,
  type ImportMode,
} from "@/database/settingsTypes"
import { useCreateBookMutation } from "@/store/api"
import { bookAccept } from "@/uploadFileTypes"

import { ServerFileBrowser } from "./ServerFileBrowser"

const IMPORT_MODE_OPTIONS: { value: ImportMode; label: string }[] = [
  { value: "reference", label: "Reference in place" },
  { value: "copy", label: "Copy to library" },
  { value: "move", label: "Move to library" },
  { value: "hardlink", label: "Hard link to library" },
]

interface Props {
  isOpen: boolean
  collection: Collection | undefined
  onClose: () => void
}

type Epub2Prompt = {
  paths: string[]
  allPaths: string[]
  importMode: ImportMode
}

function isEpub2Response(
  data: unknown,
): data is { epub2Detected: true; paths: string[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    "epub2Detected" in data &&
    (data as Record<string, unknown>)["epub2Detected"] === true
  )
}

export function ImportServerBooksModal({ isOpen, collection, onClose }: Props) {
  const [createBookMutation, { isLoading }] = useCreateBookMutation()

  const [values, setValues] = useState<DirectoryFileEntry[]>([])
  const [importMode, setImportMode] = useState<ImportMode>("reference")
  const [epub2Prompt, setEpub2Prompt] = useState<Epub2Prompt | null>(null)

  function reset() {
    setValues([])
    setEpub2Prompt(null)
  }

  async function doImport(strategy?: Epub2ImportStrategy | "auto") {
    const paths = values.map((value) => value.path)

    const result = await createBookMutation({
      paths,
      collection: collection?.uuid,
      importMode,
      epub2Strategy: strategy ?? "auto",
    }).unwrap()

    if (isEpub2Response(result)) {
      setEpub2Prompt({
        paths: result.paths,
        allPaths: paths,
        importMode,
      })
      return
    }

    reset()
    onClose()
  }

  async function confirmEpub2(strategy: Epub2ImportStrategy) {
    if (!epub2Prompt) return

    await createBookMutation({
      paths: epub2Prompt.allPaths,
      collection: collection?.uuid,
      importMode: epub2Prompt.importMode,
      epub2Strategy: strategy,
    }).unwrap()

    reset()
    onClose()
  }

  if (epub2Prompt) {
    return (
      <Modal
        opened={isOpen}
        onClose={() => {
          reset()
          onClose()
        }}
        title="EPUB 2 detected"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {epub2Prompt.paths.length === 1
              ? "The selected file is an EPUB 2 file, which Storyteller does not natively support."
              : `${epub2Prompt.paths.length} of the selected files are EPUB 2, which Storyteller does not natively support.`}
          </Text>
          <Text size="sm">What would you like to do?</Text>

          <Stack gap="xs">
            <Button
              fullWidth
              loading={isLoading}
              onClick={() => void confirmEpub2("replace")}
            >
              Upgrade to EPUB 3
            </Button>
            <Button
              fullWidth
              variant="light"
              loading={isLoading}
              onClick={() => void confirmEpub2("backup-and-convert")}
            >
              Upgrade, but keep a backup of the original
            </Button>
            <Button
              fullWidth
              variant="subtle"
              loading={isLoading}
              onClick={() => void confirmEpub2("skip")}
            >
              Skip EPUB 2 files
            </Button>
          </Stack>
        </Stack>
      </Modal>
    )
  }

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Import books from server"
      size="xl"
      classNames={{
        body: "flex h-[calc(100%-60px)] flex-col",
      }}
    >
      <ServerFileBrowser
        accept={bookAccept}
        multiple
        value={values}
        onChange={setValues}
      />

      <div className="sticky bottom-0 -mx-4 mt-2 -mb-4 border-t bg-white px-4 py-3 dark:border-neutral-500 dark:bg-neutral-800">
        <Stack gap="xs">
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

          <Group justify="flex-end">
            <Button
              variant="filled"
              disabled={isLoading || values.length === 0}
              loading={isLoading}
              onClick={() => void doImport()}
            >
              Import {values.length > 0 ? `(${values.length})` : ""}
            </Button>
          </Group>
        </Stack>
      </div>
    </Modal>
  )
}
