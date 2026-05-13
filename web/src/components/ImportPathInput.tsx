import {
  ActionIcon,
  Button,
  Fieldset,
  Group,
  Stack,
  Switch,
  useComputedColorScheme,
} from "@mantine/core"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { type ReactNode, useState } from "react"

import { ServerFilePicker } from "./books/modals/ServerFilePicker"

interface MultiPathProps {
  value?: string[] | null
  onChange: (update: string[] | null) => void
  children?: ReactNode
  disabled?: boolean
}

export function ImportPathInput({
  value,
  onChange,
  children,
  disabled,
}: MultiPathProps) {
  const paths = value ?? []
  const [enableAutoimport, setEnableAutoimport] = useState(paths.length > 0)
  const [addingPathIndex, setAddingPathIndex] = useState<number | null>(null)
  const computedColorScheme = useComputedColorScheme()

  function removePath(index: number) {
    const next = paths.filter((_, i) => i !== index)
    onChange(next.length === 0 ? null : next)
    if (next.length === 0) {
      setEnableAutoimport(false)
    }
  }

  function isDuplicate(folder: string, excludeIndex?: number) {
    return paths.some((p, i) => i !== excludeIndex && p === folder)
  }

  function updatePath(index: number, folder: string) {
    if (isDuplicate(folder, index)) return

    const next = [...paths]
    next[index] = folder
    onChange(next)
    setAddingPathIndex(null)
  }

  function addPath(folder: string) {
    if (isDuplicate(folder)) return

    onChange([...paths, folder])
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
            setAddingPathIndex(paths.length === 0 ? 0 : null)
          } else {
            setEnableAutoimport(false)
            setAddingPathIndex(null)
            onChange(null)
          }
        }}
      />
      {enableAutoimport && (
        <Stack gap="xs">
          {paths.map((path, i) => (
            <Group key={i} gap="xs" wrap="nowrap">
              <Button
                variant={computedColorScheme === "dark" ? "default" : "white"}
                className="flex-1"
                classNames={{ inner: "justify-start" }}
                onClick={() => {
                  setAddingPathIndex(i)
                }}
              >
                {path}
              </Button>
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
                addingPathIndex < paths.length
                  ? paths[addingPathIndex] ?? "/"
                  : paths[paths.length - 1] ?? "/"
              }
              onChange={(folder) => {
                if (addingPathIndex < paths.length) {
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
                setAddingPathIndex(paths.length)
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
  value?: string | null
  onChange: (update: string | null) => void
  children?: ReactNode
}

export function SingleImportPathInput({
  value,
  onChange,
  children,
}: SinglePathProps) {
  const arrayValue = value ? [value] : null

  function handleChange(paths: string[] | null) {
    onChange(paths?.[0] ?? null)
  }

  return (
    <ImportPathInput value={arrayValue} onChange={handleChange}>
      {children}
    </ImportPathInput>
  )
}
