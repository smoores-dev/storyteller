import {
  ActionIcon,
  Button,
  Fieldset,
  Group,
  NativeSelect,
  Stack,
  Switch,
  Text,
  useComputedColorScheme,
} from "@mantine/core"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { type ReactNode, useState } from "react"

import { type ImportPathEntry } from "@/database/settingsTypes"

import { ServerFilePicker } from "./books/modals/ServerFilePicker"

const IMPORT_MODE_OPTIONS = [
  { value: "", label: "Use default" },
  { value: "reference", label: "Reference in place" },
  { value: "copy", label: "Copy to library" },
  { value: "move", label: "Move to library" },
  { value: "hardlink", label: "Hard link to library" },
]

interface MultiPathProps {
  value?: ImportPathEntry[] | null
  onChange: (update: ImportPathEntry[] | null) => void
  children?: ReactNode
  disabled?: boolean
}

export function ImportPathInput({
  value,
  onChange,
  children,
  disabled,
}: MultiPathProps) {
  const entries = value ?? []
  const [enableAutoimport, setEnableAutoimport] = useState(entries.length > 0)
  const [addingPathIndex, setAddingPathIndex] = useState<number | null>(null)
  const computedColorScheme = useComputedColorScheme()

  function removePath(index: number) {
    const next = entries.filter((_, i) => i !== index)
    onChange(next.length === 0 ? null : next)

    if (next.length === 0) {
      setEnableAutoimport(false)
    }
  }

  function isDuplicate(folder: string, excludeIndex?: number) {
    return entries.some((e, i) => i !== excludeIndex && e.path === folder)
  }

  function updatePath(index: number, folder: string) {
    if (isDuplicate(folder, index)) return

    const existing = entries[index]
    if (!existing) return

    const next = [...entries]
    next[index] = { ...existing, path: folder }
    onChange(next)
    setAddingPathIndex(null)
  }

  function updateImportMode(index: number, mode: string) {
    const existing = entries[index]
    if (!existing) return

    const next = [...entries]
    next[index] = {
      ...existing,
      importMode: mode === "" ? null : (mode as ImportPathEntry["importMode"]),
    }
    onChange(next)
  }

  function addPath(folder: string) {
    if (isDuplicate(folder)) return

    onChange([...entries, { path: folder }])
    setAddingPathIndex(null)
  }

  return (
    <Fieldset
      legend="Automatic import"
      className="flex flex-col gap-4"
      disabled={disabled}
    >
      {children}
      <Switch
        label="Enable"
        checked={enableAutoimport}
        onChange={(event) => {
          if (event.target.checked) {
            setEnableAutoimport(true)
            setAddingPathIndex(entries.length === 0 ? 0 : null)
          } else {
            setEnableAutoimport(false)
            setAddingPathIndex(null)
            onChange(null)
          }
        }}
      />

      {enableAutoimport && (
        <Stack gap="sm">
          {entries.map((entry, i) => (
            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
              <Button
                variant={computedColorScheme === "dark" ? "default" : "white"}
                className="min-w-0 flex-1"
                classNames={{ inner: "justify-start" }}
                onClick={() => {
                  setAddingPathIndex(i)
                }}
              >
                <Text className="truncate text-sm">{entry.path}</Text>
              </Button>

              <NativeSelect
                size="xs"
                className="w-[160px] shrink-0"
                value={entry.importMode ?? ""}
                onChange={(e) => {
                  updateImportMode(i, e.currentTarget.value)
                }}
              >
                {IMPORT_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect>

              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => {
                  removePath(i)
                }}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}

          {addingPathIndex !== null && (
            <ServerFilePicker
              startPath={
                addingPathIndex < entries.length
                  ? entries[addingPathIndex]?.path ?? "/"
                  : entries[entries.length - 1]?.path ?? "/"
              }
              onChange={(folder) => {
                if (addingPathIndex < entries.length) {
                  updatePath(addingPathIndex, folder)
                } else {
                  addPath(folder)
                }
              }}
            />
          )}

          {addingPathIndex === null && (
            <Button
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              className="self-start"
              onClick={() => {
                setAddingPathIndex(entries.length)
              }}
            >
              Add path
            </Button>
          )}
        </Stack>
      )}
    </Fieldset>
  )
}

interface SinglePathProps {
  value?: ImportPathEntry | null
  onChange: (update: ImportPathEntry[] | null) => void
  children?: ReactNode
}

export function SingleImportPathInput({
  value,
  onChange,
  children,
}: SinglePathProps) {
  const arrayValue = value ? [value] : null

  return (
    <ImportPathInput value={arrayValue} onChange={onChange}>
      {children}
    </ImportPathInput>
  )
}
