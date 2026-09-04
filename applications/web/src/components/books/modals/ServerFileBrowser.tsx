import {
  ActionIcon,
  Button,
  Combobox,
  Group,
  Loader,
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
import { useEffect, useMemo, useRef, useState } from "react"

import { getSuggestedImportPathAction } from "@/actions/getSuggestedImportPathAction"
import {
  type DirectoryEntry,
  type DirectoryFileEntry,
  listDirectoryAction,
} from "@/actions/listDirectoryAction"
import { formatBytes } from "@/strings"
import { matchesAccept } from "@/uploadFileTypes"

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

function useListDirectory(
  currentSearchDirectory: string | null,
  suggestedPath: string | null,
  setCurrentSearchDirectory: (dir: string | null) => void,
) {
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
        setEntries(entries)
        setActionIsPending(false)
      },
    )
  }, [currentSearchDirectory, setCurrentSearchDirectory, suggestedPath])

  return { entries, actionIsPending }
}

type ServerFileBrowserBaseProps = {
  accept?: string
  fileFilter?: (entry: { name: string; isDirectory: boolean }) => boolean
  directoriesOnly?: boolean
  startPath?: string
  className?: string
}

type ServerFileBrowserMultiProps = ServerFileBrowserBaseProps & {
  multiple: true
  value: DirectoryFileEntry[]
  onChange: (entries: DirectoryFileEntry[]) => void
}

type ServerFileBrowserSingleProps = ServerFileBrowserBaseProps & {
  multiple?: false
  onSelect: (path: string) => void
  selectLabel?: string
}

export type ServerFileBrowserProps =
  | ServerFileBrowserMultiProps
  | ServerFileBrowserSingleProps

export function ServerFileBrowser(props: ServerFileBrowserProps) {
  const {
    accept,
    fileFilter,
    directoriesOnly = false,
    startPath,
    className,
  } = props

  const combobox = useCombobox()
  const inputRef = useRef<HTMLInputElement>(null)
  const { updateSelectedOptionIndex, selectFirstOption, focusTarget } = combobox

  const [currentSearchDirectory, setCurrentSearchDirectory] = useState<
    string | null
  >(startPath ?? null)

  const { paths, isLoading: pathsLoading } = useImportPaths()

  const { entries: rawEntries, actionIsPending } = useListDirectory(
    currentSearchDirectory,
    paths?.suggestedPath ?? null,
    setCurrentSearchDirectory,
  )

  const filteredEntries = useMemo(() => {
    return rawEntries.filter((entry) => {
      if (entry.isDirectory) return true
      if (directoriesOnly) return false

      if (fileFilter) return fileFilter(entry)
      if (!accept) return true

      return matchesAccept(entry.name, accept)
    })
  }, [rawEntries, directoriesOnly, fileFilter, accept])

  const entries = useMemo(() => {
    return matchSorter(
      filteredEntries,
      currentSearchDirectory ? basename(currentSearchDirectory) : "",
      { keys: ["name"] },
    )
  }, [filteredEntries, currentSearchDirectory])

  const handleGoUp = () => {
    if (!currentSearchDirectory) return
    setCurrentSearchDirectory(parentDir(currentSearchDirectory))
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

  const handleOptionSubmit = (val: string) => {
    if (val.endsWith("/")) {
      setCurrentSearchDirectory(val)
      return
    }

    if (props.multiple) {
      const isSelected = props.value.some((e) => e.path === val)

      if (isSelected) {
        props.onChange(props.value.filter((e) => e.path !== val))
      } else {
        const entry = entries.find((e) => e.path === val) as DirectoryFileEntry
        props.onChange([...props.value, entry])
      }
    } else {
      props.onSelect(val)
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

  const showSelectButton =
    !props.multiple &&
    (directoriesOnly || props.selectLabel) &&
    currentSearchDirectory

  if (pathsLoading) {
    return (
      <div
        className={cx(
          "flex min-h-[200px] items-center justify-center",
          className,
        )}
      >
        <Loader />
      </div>
    )
  }

  return (
    <div className={cx("relative flex min-h-0 flex-1 flex-col", className)}>
      <Combobox
        store={combobox}
        onOptionSubmit={handleOptionSubmit}
        disabled={actionIsPending}
      >
        <div className="sticky top-0 flex flex-col gap-2 bg-white dark:bg-neutral-800">
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

            <div className="h-4 w-px bg-gray-300 dark:bg-neutral-500" />

            {currentDirName && (
              <div className="line-clamp-1 flex min-w-0 flex-1 items-center gap-2 truncate whitespace-nowrap">
                <IconFolderOpen
                  size={14}
                  className="shrink-0 text-gray-500 dark:text-neutral-400"
                />
                <Text
                  size="xs"
                  className="truncate text-gray-500 dark:text-neutral-400"
                >
                  {currentDirName}
                </Text>
              </div>
            )}

            {showSelectButton && (
              <Button
                variant="light"
                color="green"
                size="compact-xs"
                className="ml-auto shrink-0"
                disabled={actionIsPending}
                onClick={() => {
                  if (currentSearchDirectory) {
                    props.onSelect(currentSearchDirectory)
                  }
                }}
              >
                {props.selectLabel || "Select this folder"}
              </Button>
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

          {props.multiple && props.value.length > 0 && (
            <div className="mt-1 max-h-20 overflow-auto">
              <Pill.Group>
                {props.value.map((entry) => (
                  <Pill
                    key={entry.path}
                    size="xs"
                    withRemoveButton
                    onRemove={() => {
                      props.onChange(
                        props.value.filter((v) => v.path !== entry.path),
                      )
                    }}
                  >
                    {entry.name}
                  </Pill>
                ))}
              </Pill.Group>
            </div>
          )}

          {props.multiple && (
            <Group justify="space-between" className="my-1">
              <Group gap="xs">
                <Button
                  variant="subtle"
                  size="compact-xs"
                  onClick={() => {
                    const newValues = [
                      ...props.value.filter(
                        (v) => !entries.some((e) => e.path === v.path),
                      ),
                      ...entries.filter((e) => !e.isDirectory),
                    ]
                    props.onChange(newValues)
                  }}
                  disabled={
                    actionIsPending || !hasFiles || entries.length === 0
                  }
                >
                  Select all
                </Button>

                {props.value.length > 0 && (
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    color="red"
                    onClick={() => {
                      props.onChange([])
                    }}
                    leftSection={<IconX size={12} />}
                  >
                    Clear
                  </Button>
                )}
              </Group>

              {props.value.length > 0 && (
                <Text size="xs" c="dimmed">
                  {props.value.length} selected
                </Text>
              )}
            </Group>
          )}
        </div>

        <Combobox.Options className="min-h-0 flex-1 overflow-auto">
          {entries.length === 0 && !actionIsPending && (
            <div className="flex h-full items-center justify-center">
              <Text size="sm" c="dimmed">
                No files or folders found
              </Text>
            </div>
          )}

          {entries.map((entry) => {
            const isSelected = props.multiple
              ? props.value.some((v) => v.path === entry.path)
              : false

            return (
              <Combobox.Option
                key={entry.name}
                active={isSelected}
                value={entry.path}
              >
                <Group gap="sm">
                  {props.multiple && (
                    <IconCheck
                      size={14}
                      className={cx({ invisible: !isSelected })}
                    />
                  )}

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
            )
          })}
        </Combobox.Options>
      </Combobox>
    </div>
  )
}
