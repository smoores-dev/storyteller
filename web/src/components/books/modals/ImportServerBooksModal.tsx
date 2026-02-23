import {
  ActionIcon,
  Button,
  Combobox,
  Group,
  Loader,
  Modal,
  Pill,
  Text,
  TextInput,
  Tooltip,
  useCombobox,
} from "@mantine/core"
import {
  IconCheck,
  IconChevronUp,
  IconDatabase,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconHome,
  IconX,
} from "@tabler/icons-react"
import cx from "classnames"
import { matchSorter } from "match-sorter"
import { lookup } from "mime-types"
import { useEffect, useRef, useState } from "react"

import { getSuggestedImportPathAction } from "@/actions/getSuggestedImportPathAction"
import {
  type DirectoryEntry,
  type DirectoryFileEntry,
  listDirectoryAction,
} from "@/actions/listDirectoryAction"
import { type Collection } from "@/database/collections"
import { useCreateBookMutation } from "@/store/api"
import { formatBytes } from "@/strings"

function dirname(path: string) {
  const segments = path.split("/")
  const dirSegments = segments.slice(0, -1)
  return [...dirSegments, ""].join("/")
}

function basename(path: string) {
  const segments = path.split("/")
  return segments[segments.length - 1] ?? ""
}

function parentDir(path: string) {
  const normalized = path.replace(/\/+$/, "")
  const parent = dirname(normalized)
  return parent || "/"
}

function useImportPaths() {
  const [paths, setPaths] = useState<{
    suggestedPath: string
    dataDir: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    void getSuggestedImportPathAction().then((result) => {
      setPaths({
        suggestedPath: result.suggestedPath,
        dataDir: result.dataDir,
      })
      setIsLoading(false)
    })
  }, [])

  return { paths, isLoading }
}

function useListDirectoryAction(
  currentSearchDirectory: string | null,
  accept: string,
  setCurrentSearchDirectory: (directory: string | null) => void,
  suggestedPath: string | null,
) {
  const fileTypes = accept.split(",")

  const [entries, setEntries] = useState<DirectoryEntry[]>([])

  const [actionIsPending, setActionIsPending] = useState(false)

  useEffect(() => {
    const startPath = currentSearchDirectory ?? suggestedPath
    if (startPath === null) return

    setActionIsPending(true)
    void listDirectoryAction(dirname(startPath)).then(
      ({ entries, directory }) => {
        if (!currentSearchDirectory) {
          setCurrentSearchDirectory(directory)
        }
        setEntries(
          entries.filter(
            (entry) =>
              entry.isDirectory ||
              fileTypes.some((type) => {
                if (type.startsWith(".")) {
                  return entry.name.endsWith(type)
                }
                const contentType = lookup(entry.name)
                if (!contentType) return false
                if (type.endsWith("/*")) {
                  return contentType.startsWith(type.slice(0, type.length - 1))
                }
                return contentType === type
              }),
          ),
        )
        setActionIsPending(false)
      },
    )
  }, [
    currentSearchDirectory,
    fileTypes,
    setCurrentSearchDirectory,
    suggestedPath,
  ])

  const matchedEntries = matchSorter(
    entries,
    currentSearchDirectory ? basename(currentSearchDirectory) : "",
    {
      keys: ["name"],
    },
  )

  return { entries: matchedEntries, actionIsPending }
}

interface Props {
  isOpen: boolean
  collection: Collection | undefined
  onClose: () => void
}

export function ImportServerBooksModal({ isOpen, collection, onClose }: Props) {
  const [createBookMutation, { isLoading }] = useCreateBookMutation()
  const combobox = useCombobox()
  const inputRef = useRef<HTMLInputElement>(null)

  const { updateSelectedOptionIndex, selectFirstOption, focusTarget } = combobox

  const [currentSearchDirectory, setCurrentSearchDirectory] = useState<
    string | null
  >(null)
  const [values, setValues] = useState<DirectoryFileEntry[]>([])

  const { paths, isLoading: pathsLoading } = useImportPaths()

  const { entries, actionIsPending } = useListDirectoryAction(
    currentSearchDirectory,
    ".epub,.m4b,.m4a,.zip,audio/*,video/*,application/epub+zip",
    setCurrentSearchDirectory,
    paths?.suggestedPath ?? null,
  )

  const handleSelectAll = () => {
    setValues((prev) => [
      ...prev.filter((v) => !entries.some((entry) => entry.path === v.path)),
      ...entries.filter((entry) => !entry.isDirectory),
    ])
  }

  const handleClearSelection = () => {
    setValues([])
  }

  const handleValueSelect = (val: string) => {
    if (val.endsWith("/")) {
      setCurrentSearchDirectory(val)
      return
    }
    setValues((prev) =>
      prev.some((entry) => entry.path === val)
        ? prev.filter((v) => v.path !== val)
        : [...prev, entries.find((e) => e.path === val) as DirectoryFileEntry],
    )
  }

  const handleValueRemove = (val: string) => {
    setValues((prev) => prev.filter((v) => v.path !== val))
  }

  const handleGoUp = () => {
    if (!currentSearchDirectory) return
    const parent = parentDir(currentSearchDirectory)
    setCurrentSearchDirectory(parent)
  }

  const handleGoHome = () => {
    if (paths?.suggestedPath) {
      setCurrentSearchDirectory(paths.suggestedPath)
    }
  }

  const handleGoToDataDir = () => {
    if (paths?.dataDir) {
      setCurrentSearchDirectory(paths.dataDir)
    }
  }

  useEffect(() => {
    selectFirstOption()
    updateSelectedOptionIndex("selected")
    focusTarget()
  }, [focusTarget, entries, selectFirstOption, updateSelectedOptionIndex])

  const currentDirName = currentSearchDirectory
    ? basename(dirname(currentSearchDirectory).replace(/\/$/, ""))
    : ""

  const isAtRoot =
    currentSearchDirectory === "/" || currentSearchDirectory === ""

  const hasFiles = entries.some((e) => !e.isDirectory)

  if (pathsLoading) {
    return (
      <Modal
        opened={isOpen}
        onClose={onClose}
        title="Import books from server"
        centered
        size="xl"
      >
        <div className="flex h-64 items-center justify-center">
          <Loader />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        setValues([])
        onClose()
      }}
      title="Import books from server"
      size="xl"
      classNames={{
        body: "flex h-[calc(100%-60px)]  flex-col",
      }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Combobox
          store={combobox}
          onOptionSubmit={handleValueSelect}
          disabled={actionIsPending}
        >
          <div className="sticky top-[60px] flex flex-col gap-2 bg-white">
            <div className="mb-1 flex flex-wrap items-center gap-2 md:flex-nowrap">
              <Tooltip label="Go up one folder">
                <ActionIcon
                  variant="light"
                  size="sm"
                  disabled={isAtRoot || actionIsPending}
                  onClick={handleGoUp}
                  aria-label="Go up one folder"
                >
                  <IconChevronUp size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Go to suggested folder">
                <ActionIcon
                  variant="light"
                  size="sm"
                  disabled={actionIsPending}
                  onClick={handleGoHome}
                  aria-label="Go to suggested folder"
                >
                  <IconHome size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Go to data directory">
                <ActionIcon
                  variant="light"
                  size="sm"
                  disabled={actionIsPending}
                  onClick={handleGoToDataDir}
                  aria-label="Go to data directory"
                >
                  <IconDatabase size={14} />
                </ActionIcon>
              </Tooltip>
              <div className="h-4 w-px bg-gray-300" />
              {currentDirName && (
                <div className="line-clamp-1 flex max-w-full items-center gap-2 truncate whitespace-nowrap">
                  <IconFolderOpen
                    size={14}
                    className="size-4 grow text-gray-500"
                  />
                  <Text size="xs" c="dimmed" className="truncate">
                    {currentDirName}
                  </Text>
                </div>
              )}
              {actionIsPending && <Loader size="xs" />}
            </div>

            <Combobox.EventsTarget>
              <TextInput
                ref={inputRef}
                size="sm"
                classNames={{ root: "!my-0" }}
                placeholder="Type to filter or enter a path..."
                value={currentSearchDirectory ?? ""}
                onChange={(event) => {
                  setCurrentSearchDirectory(event.currentTarget.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && !currentSearchDirectory) {
                    return
                  }
                  if (
                    event.key === "Backspace" &&
                    currentSearchDirectory &&
                    basename(currentSearchDirectory) === ""
                  ) {
                    event.preventDefault()
                    handleGoUp()
                  }
                }}
                rightSection={actionIsPending ? <Loader size="xs" /> : null}
              />
            </Combobox.EventsTarget>
            {values.length > 0 && (
              <div className="mt-1 max-h-20 overflow-auto">
                <Pill.Group>
                  {values.map((entry) => (
                    <Pill
                      key={entry.path}
                      size="xs"
                      withRemoveButton
                      onRemove={() => {
                        handleValueRemove(entry.path)
                      }}
                    >
                      {entry.name}
                    </Pill>
                  ))}
                </Pill.Group>
              </div>
            )}
            <Group justify="space-between" className="my-1">
              <Group gap="xs">
                <Button
                  variant="subtle"
                  size="compact-xs"
                  onClick={handleSelectAll}
                  disabled={
                    actionIsPending || !hasFiles || entries.length === 0
                  }
                >
                  Select all
                </Button>
                {values.length > 0 && (
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    color="red"
                    onClick={handleClearSelection}
                    leftSection={<IconX size={12} />}
                  >
                    Clear
                  </Button>
                )}
              </Group>
              {values.length > 0 && (
                <Text size="xs" c="dimmed">
                  {values.length} selected
                </Text>
              )}
            </Group>
          </div>

          <Combobox.Options className="min-h-0 flex-1 overflow-auto">
            {entries.length === 0 && !actionIsPending && (
              <div className="flex h-full items-center justify-center">
                <Text size="sm" c="dimmed">
                  No files or folders found
                </Text>
              </div>
            )}
            {entries.map((entry) => (
              <Combobox.Option
                key={entry.name}
                active={values.some((value) => value.path === entry.path)}
                value={entry.path}
              >
                <Group gap="sm">
                  <IconCheck
                    size={14}
                    className={cx({
                      invisible: values.every(
                        (value) => value.path !== entry.path,
                      ),
                    })}
                  />
                  {entry.isDirectory ? (
                    <IconFolder size={14} />
                  ) : (
                    <IconFile size={14} />
                  )}
                  <Text size="sm" className="flex-1">
                    {entry.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {entry.isDirectory ? "" : formatBytes(entry.size)}
                  </Text>
                </Group>
              </Combobox.Option>
            ))}
          </Combobox.Options>
        </Combobox>
      </div>

      <div className="dark:bg-dark-700 sticky bottom-0 -mx-4 mt-2 -mb-4 border-t bg-white px-4 py-3">
        <Group justify="flex-end">
          <Button
            variant="filled"
            disabled={isLoading || values.length === 0}
            loading={isLoading}
            onClick={async () => {
              await createBookMutation({
                paths: values.map((value) => value.path),
                collection: collection?.uuid,
              })

              setValues([])
              onClose()
            }}
          >
            Import {values.length > 0 ? `(${values.length})` : ""}
          </Button>
        </Group>
      </div>
    </Modal>
  )
}
