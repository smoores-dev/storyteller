import {
  DirectoryEntry,
  DirectoryFileEntry,
  listDirectoryAction,
} from "@/actions/listDirectoryAction"
import { useEffect, useMemo, useState } from "react"
import { matchSorter } from "match-sorter"
import { FolderIcon } from "../icons/FolderIcon"
import { FileIcon } from "../icons/FileIcon"
import {
  Pill,
  Combobox,
  useCombobox,
  TextInput,
  Group,
  Text,
  Stack,
  Button,
} from "@mantine/core"
import { formatBytes } from "@/strings"
import { IconCheck } from "@tabler/icons-react"
import cx from "classnames"
import { lookup } from "mime-types"

function dirname(path: string) {
  const segments = path.split("/")
  const dirSegments = segments.slice(0, -1)
  return [...dirSegments, ""].join("/")
}

function basename(path: string) {
  const segments = path.split("/")
  return segments[segments.length - 1] ?? ""
}

function useListDirectoryAction(
  currentSearchDirectory: string,
  accept: string,
) {
  const fileTypes = useMemo(() => accept.split(","), [accept])
  const [entries, setEntries] = useState<DirectoryEntry[]>([])

  const [actionIsPending, setActionIsPending] = useState(false)

  useEffect(() => {
    setActionIsPending(true)
    void listDirectoryAction(dirname(currentSearchDirectory)).then(
      (entries) => {
        setEntries(
          entries.filter(
            (entry) =>
              entry.isDirectory ||
              fileTypes.some((type) => {
                if (type.startsWith(".")) {
                  return entry.name.endsWith(type)
                }
                const contentType = entry.name.endsWith(".m4b")
                  ? "audio/mpeg4"
                  : lookup(entry.name)
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
  }, [currentSearchDirectory, fileTypes])

  const matchedEntries = useMemo(() => {
    return matchSorter(entries, basename(currentSearchDirectory), {
      keys: ["name"],
    })
  }, [currentSearchDirectory, entries])

  return { entries: matchedEntries, actionIsPending }
}

type Props =
  | {
      accept: string
      multiple?: false | undefined
      onChange: (file: DirectoryFileEntry | null) => void
    }
  | {
      accept: string
      multiple: true
      onChange: (files: DirectoryFileEntry[]) => void
    }

function ServerMultipleFilePicker({
  accept,
  onChange,
}: {
  accept: string
  onChange: (files: DirectoryFileEntry[]) => void
}) {
  const combobox = useCombobox()

  const { updateSelectedOptionIndex, selectFirstOption, focusTarget } = combobox

  const [currentSearchDirectory, setCurrentSearchDirectory] = useState("/")
  const [values, setValues] = useState<DirectoryFileEntry[]>([])

  function handleSelectAll() {
    setValues((prev) => [
      ...prev.filter((v) => !entries.some((entry) => entry.path === v.path)),
      ...entries.filter((entry) => !entry.isDirectory),
    ])
  }

  function handleValueSelect(val: string) {
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

  function handleValueRemove(val: string) {
    setValues((prev) => prev.filter((v) => v.path !== val))
  }

  const { entries, actionIsPending } = useListDirectoryAction(
    currentSearchDirectory,
    accept,
  )

  // Whenever we change the list of entries, reset the selection
  // to the first option
  useEffect(() => {
    selectFirstOption()
    updateSelectedOptionIndex("selected")
    focusTarget()
  }, [focusTarget, entries, selectFirstOption, updateSelectedOptionIndex])

  return (
    <Stack>
      <Combobox
        store={combobox}
        onOptionSubmit={handleValueSelect}
        disabled={actionIsPending}
      >
        <Pill.Group>
          {values.map((entry) => (
            <Pill
              key={entry.path}
              withRemoveButton
              onRemove={() => {
                handleValueRemove(entry.path)
              }}
            >
              {entry.name}
            </Pill>
          ))}
        </Pill.Group>
        <Combobox.EventsTarget>
          <TextInput
            placeholder="Pick value"
            value={currentSearchDirectory}
            onChange={(event) => {
              setCurrentSearchDirectory(event.currentTarget.value)
            }}
          />
        </Combobox.EventsTarget>
        <Button
          className="self-start"
          variant="subtle"
          size="compact-sm"
          onClick={() => {
            handleSelectAll()
          }}
        >
          Select all
        </Button>
        <Combobox.Options className="h-96 max-h-full overflow-auto">
          {entries.map((entry) => (
            <Combobox.Option
              key={entry.name}
              active={values.some((value) => value.path === entry.path)}
              value={entry.path}
            >
              <Group>
                <IconCheck
                  className={cx({
                    invisible: values.every(
                      (value) => value.path !== entry.path,
                    ),
                  })}
                />
                {entry.isDirectory ? (
                  <FolderIcon height="1rem" />
                ) : (
                  <FileIcon height="1rem" />
                )}
                <Text>{entry.name}</Text>
                <Text>{entry.isDirectory ? " " : formatBytes(entry.size)}</Text>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox>
      <Button
        className="self-end"
        variant="filled"
        onClick={() => {
          onChange(values)
        }}
      >
        Select
      </Button>
    </Stack>
  )
}

function ServerSingleFilePicker({
  accept,
  onChange,
}: {
  accept: string
  onChange: (files: DirectoryFileEntry | null) => void
}) {
  const combobox = useCombobox()

  const { updateSelectedOptionIndex, selectFirstOption, focusTarget } = combobox

  const [currentSearchDirectory, setCurrentSearchDirectory] = useState("/")
  const [value, setValue] = useState<DirectoryFileEntry | null>(null)

  function handleValueSelect(val: string) {
    if (val.endsWith("/")) {
      setCurrentSearchDirectory(val)
      return
    }
    setValue((prev) =>
      prev?.path === val
        ? null
        : (entries.find((e) => e.path === val) as DirectoryFileEntry),
    )
  }

  const { entries, actionIsPending } = useListDirectoryAction(
    currentSearchDirectory,
    accept,
  )

  // Whenever we change the list of entries, reset the selection
  // to the first option
  useEffect(() => {
    selectFirstOption()
    updateSelectedOptionIndex("selected")
    focusTarget()
  }, [focusTarget, entries, selectFirstOption, updateSelectedOptionIndex])

  return (
    <Stack>
      <Combobox
        store={combobox}
        onOptionSubmit={handleValueSelect}
        disabled={actionIsPending}
      >
        <Combobox.EventsTarget>
          <TextInput
            classNames={{ input: "text-lg md:text-base" }}
            placeholder="Pick value"
            value={currentSearchDirectory}
            onChange={(event) => {
              setCurrentSearchDirectory(event.currentTarget.value)
            }}
          />
        </Combobox.EventsTarget>
        <Combobox.Options className="h-96 max-h-full overflow-auto">
          {entries.map((entry) => (
            <Combobox.Option
              key={entry.name}
              active={value?.path === entry.path}
              value={entry.path}
            >
              <Group>
                <IconCheck
                  className={cx({
                    invisible: value?.path !== entry.path,
                  })}
                />
                {entry.isDirectory ? (
                  <FolderIcon height="1rem" />
                ) : (
                  <FileIcon height="1rem" />
                )}
                <Text>{entry.name}</Text>
                <Text>{entry.isDirectory ? " " : formatBytes(entry.size)}</Text>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox>
      <Button
        className="self-end"
        variant="filled"
        onClick={() => {
          onChange(value)
        }}
      >
        Select
      </Button>
    </Stack>
  )
}

export function ServerFilePicker({ accept, multiple, onChange }: Props) {
  if (multiple) {
    return <ServerMultipleFilePicker accept={accept} onChange={onChange} />
  }

  return <ServerSingleFilePicker accept={accept} onChange={onChange} />
}
