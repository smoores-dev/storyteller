import {
  DirectoryEntry,
  listDirectoryAction,
} from "@/actions/listDirectoryAction"
import { useEffect, useMemo, useState } from "react"
import { matchSorter } from "match-sorter"
import { FolderIcon } from "../../icons/FolderIcon"
import {
  Combobox,
  useCombobox,
  TextInput,
  Group,
  Text,
  Stack,
  Button,
} from "@mantine/core"

function dirname(path: string) {
  const segments = path.split("/")
  const dirSegments = segments.slice(0, -1)
  return [...dirSegments, ""].join("/")
}

function basename(path: string) {
  const segments = path.split("/")
  return segments[segments.length - 1] ?? ""
}

function useListDirectoryAction(currentSearchDirectory: string) {
  const [entries, setEntries] = useState<DirectoryEntry[]>([])

  const [actionIsPending, setActionIsPending] = useState(false)

  useEffect(() => {
    setActionIsPending(true)
    void listDirectoryAction(dirname(currentSearchDirectory)).then(
      (entries) => {
        setEntries(entries.filter((entry) => entry.isDirectory))
        setActionIsPending(false)
      },
    )
  }, [currentSearchDirectory])

  const matchedEntries = useMemo(() => {
    return matchSorter(entries, basename(currentSearchDirectory), {
      keys: ["name"],
    })
  }, [currentSearchDirectory, entries])

  return { entries: matchedEntries, actionIsPending }
}

export function ServerFilePicker({
  startPath,
  onChange,
}: {
  startPath: string
  onChange: (path: string) => void
}) {
  const combobox = useCombobox()

  const { updateSelectedOptionIndex, selectFirstOption, focusTarget } = combobox

  const [currentSearchDirectory, setCurrentSearchDirectory] =
    useState(startPath)

  function handleValueSelect(val: string) {
    setCurrentSearchDirectory(val)
  }

  const { entries, actionIsPending } = useListDirectoryAction(
    currentSearchDirectory,
  )

  // Whenever we change the list of entries, reset the selection
  // to the first option
  useEffect(() => {
    selectFirstOption()
    updateSelectedOptionIndex("selected")
    focusTarget()
  }, [focusTarget, entries, selectFirstOption, updateSelectedOptionIndex])

  return (
    <Stack gap={2}>
      <Button
        className="self-end"
        variant="subtle"
        size="compact-md"
        onClick={() => {
          onChange(currentSearchDirectory)
        }}
      >
        Save
      </Button>
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
            <Combobox.Option key={entry.name} value={entry.path}>
              <Group>
                <FolderIcon height="1rem" />
                <Text>{entry.name}</Text>
              </Group>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox>
    </Stack>
  )
}

// export function ServerFilePickerModal({
//   isOpen,
//   onClose,
// }: {
//   isOpen: boolean
//   onClose: () => void
// }) {
//   const [type, setType] = useState<"ebook" | "audio" | null>(null)
//   const [audioPaths, setAudioPaths] = useState<DirectoryFileEntry[] | null>(
//     null,
//   )
//   const [epubPath, setEpubPath] = useState<DirectoryEntry | null>(null)

//   return (
//     <Modal
//       opened={isOpen}
//       onClose={onClose}
//       title="Select files"
//       centered
//       size="xl"
//     >
//       {type === "audio" ? (
//         <ServerFilePicker
//           accept="application/zip,audio/*,video/*,.m4b"
//           multiple
//           onChange={(files) => {
//             setAudioPaths(files)
//           }}
//         />
//       ) : type === "ebook" ? (
//         <ServerFilePicker
//           accept="application/epub+zip"
//           onChange={(file) => {
//             setEpubPath(file)
//           }}
//         />
//       ) : (
//         <Group>
//           <Button></Button>
//         </Group>
//       )}
//     </Modal>
//   )
// }
