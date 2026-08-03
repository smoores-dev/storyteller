"use client"

import { open } from "@tauri-apps/plugin-dialog"
import { matchSorter } from "match-sorter"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@v3/_/components/ui/badge"
import { Button } from "@v3/_/components/ui/button"
import { Input } from "@v3/_/components/ui/input"
import { cn } from "@v3/_/lib/utils"

import { getSuggestedImportPathAction } from "@/actions/getSuggestedImportPathAction"
import {
  type DirectoryEntry,
  type DirectoryFileEntry,
  listDirectoryAction,
} from "@/actions/listDirectoryAction"
import { useIsTauri } from "@/app/(v3)/v3/_/hooks/use-is-tauri"
import * as icon from "@/icons"
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

// just the formats this library deals with; the full mime-types database is
// 150+ KB of client bundle for the same answer
const EXTENSION_MIME: Record<string, string> = {
  epub: "application/epub+zip",
  zip: "application/zip",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  flac: "audio/flac",
  wav: "audio/wav",
  webm: "audio/webm",
  mp4: "video/mp4",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
}

function lookupMime(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase()
  return (ext && EXTENSION_MIME[ext]) || null
}

function matchesAcceptFilter(entryName: string, fileTypes: string[]): boolean {
  return fileTypes.some((type) => {
    if (type.startsWith(".")) {
      return entryName.endsWith(type)
    }

    const contentType = lookupMime(entryName)
    if (!contentType) return false

    if (type.endsWith("/*")) {
      return contentType.startsWith(type.slice(0, type.length - 1))
    }

    return contentType === type
  })
}

type ServerFileBrowserBaseProps = {
  accept?: string
  fileFilter?: (entry: { name: string; isDirectory: boolean }) => boolean
  directoriesOnly?: boolean
  startPath?: string
  className?: string
  autoFocus?: boolean
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

export function ServerFileBrowserWeb(props: ServerFileBrowserProps) {
  const {
    accept,
    fileFilter,
    directoriesOnly = false,
    startPath,
    className,
    autoFocus = false,
  } = props

  const [currentSearchDirectory, setCurrentSearchDirectory] = useState<
    string | null
  >(startPath ?? null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  const { paths, isLoading: pathsLoading } = useImportPaths()

  const { entries: rawEntries, actionIsPending } = useListDirectory(
    currentSearchDirectory,
    paths?.suggestedPath ?? null,
    setCurrentSearchDirectory,
  )

  const fileTypes = useMemo(() => (accept ? accept.split(",") : []), [accept])

  const filteredEntries = useMemo(() => {
    return rawEntries.filter((entry) => {
      if (entry.isDirectory) return true
      if (directoriesOnly) return false

      if (fileFilter) return fileFilter(entry)
      if (fileTypes.length === 0) return true

      return matchesAcceptFilter(entry.name, fileTypes)
    })
  }, [rawEntries, directoriesOnly, fileFilter, fileTypes])

  const entries = useMemo(() => {
    return matchSorter(
      filteredEntries,
      currentSearchDirectory ? basename(currentSearchDirectory) : "",
      { keys: ["name"] },
    )
  }, [filteredEntries, currentSearchDirectory])

  useEffect(() => {
    setFocusedIndex(0)
  }, [entries])

  useEffect(() => {
    if (autoFocus && !pathsLoading) {
      inputRef.current?.focus()
    }
  }, [autoFocus, pathsLoading])

  const scrollToIndex = useCallback((index: number) => {
    const el = itemRefs.current.get(index)
    el?.scrollIntoView({ block: "nearest" })
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (entries.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      const next = Math.min(focusedIndex + 1, entries.length - 1)
      setFocusedIndex(next)
      scrollToIndex(next)
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      const next = Math.max(focusedIndex - 1, 0)
      setFocusedIndex(next)
      scrollToIndex(next)
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      const entry = entries[focusedIndex]
      if (entry) handleEntryClick(entry)
    }
  }

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

  const handleEntryClick = (entry: DirectoryEntry) => {
    if (entry.isDirectory) {
      setCurrentSearchDirectory(
        entry.path.endsWith("/") ? entry.path : `${entry.path}/`,
      )
      return
    }

    if (props.multiple) {
      const isSelected = props.value.some((e) => e.path === entry.path)
      if (isSelected) {
        props.onChange(props.value.filter((e) => e.path !== entry.path))
      } else {
        props.onChange([...props.value, entry])
      }
    } else {
      props.onSelect(entry.path)
    }
  }

  const isAtRoot =
    currentSearchDirectory === "/" || currentSearchDirectory === ""

  const hasFiles = entries.some((e) => !e.isDirectory)

  const showSelectButton =
    !props.multiple &&
    (directoriesOnly || props.selectLabel) &&
    !!currentSearchDirectory

  if (pathsLoading) {
    return (
      <div
        className={cn(
          "flex min-h-[200px] items-center justify-center",
          className,
        )}
      >
        <icon.Loader className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isAtRoot || actionIsPending}
          onClick={handleGoUp}
          aria-label="Go up one folder"
        >
          <icon.ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={actionIsPending}
          onClick={handleGoHome}
          aria-label="Go to suggested folder"
        >
          <icon.Home className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={actionIsPending}
          onClick={handleGoToDataDir}
          aria-label="Go to data directory"
        >
          <icon.Database className="h-3.5 w-3.5" />
        </Button>

        {actionIsPending && (
          <icon.Loader className="text-muted-foreground h-3.5 w-3.5 animate-spin" />
        )}

        {showSelectButton && (
          <Button
            variant="default"
            size="sm"
            className="ml-auto"
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
      </div>

      <Input
        ref={inputRef}
        placeholder="Type a path…"
        value={currentSearchDirectory ?? ""}
        onChange={(event) => {
          setCurrentSearchDirectory(event.currentTarget.value)
        }}
      />

      {props.multiple && props.value.length > 0 && (
        <>
          <div className="flex max-h-20 flex-wrap gap-1 overflow-auto">
            {props.value.map((entry) => (
              <Badge key={entry.path} variant="secondary" className="gap-1">
                {entry.name}
                <button
                  type="button"
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => {
                    props.onChange(
                      props.value.filter((v) => v.path !== entry.path),
                    )
                  }}
                >
                  <icon.Close className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                disabled={actionIsPending || !hasFiles}
                onClick={() => {
                  const newValues = [
                    ...props.value.filter(
                      (v) => !entries.some((e) => e.path === v.path),
                    ),
                    ...entries.filter((e) => !e.isDirectory),
                  ]
                  props.onChange(newValues)
                }}
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="text-destructive"
                onClick={() => {
                  props.onChange([])
                }}
              >
                Clear
              </Button>
            </div>
            <span className="text-muted-foreground text-xs">
              {props.value.length} selected
            </span>
          </div>
        </>
      )}

      <div
        ref={listRef}
        className="min-h-[200px] flex-1 overflow-auto rounded-md border"
      >
        {entries.length === 0 && !actionIsPending ? (
          <div className="flex h-full items-center justify-center py-8">
            <span className="text-muted-foreground text-sm">
              No files or folders found
            </span>
          </div>
        ) : (
          entries.map((entry, index) => {
            const isSelected = props.multiple
              ? props.value.some((v) => v.path === entry.path)
              : false
            const isFocused = index === focusedIndex

            return (
              <button
                key={entry.path}
                ref={(el) => {
                  if (el) itemRefs.current.set(index, el)
                  else itemRefs.current.delete(index)
                }}
                type="button"
                onClick={() => {
                  setFocusedIndex(index)
                  handleEntryClick(entry)
                }}
                onMouseEnter={() => {
                  setFocusedIndex(index)
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                  isFocused && "bg-accent",
                  isSelected && !isFocused && "bg-muted",
                )}
              >
                {entry.isDirectory ? (
                  <icon.Folder className="text-primary/70 h-4 w-4 shrink-0" />
                ) : (
                  <icon.File className="text-muted-foreground h-4 w-4 shrink-0" />
                )}
                <span className="flex-1 truncate">{entry.name}</span>
                <span className="text-muted-foreground text-xs">
                  {entry.isDirectory ? "" : formatBytes(entry.size)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

const MIME_WILDCARD_EXTENSIONS: Record<string, string[]> = {
  "audio/*": [
    "mp3",
    "aac",
    "mp4",
    "m4a",
    "m4b",
    "opus",
    "ogg",
    "oga",
    "wav",
    "flac",
    "weba",
  ],
  "video/*": ["mp4", "m4v", "webm"],
  "image/*": ["jpg", "jpeg", "png", "gif", "webp", "svg"],
}

function acceptToTauriFilters(
  accept: string | undefined,
): { name: string; extensions: string[] }[] | undefined {
  if (!accept) return undefined

  const extensions: string[] = []

  for (const raw of accept.split(",")) {
    const token = raw.trim()
    if (!token) continue

    if (token.startsWith(".")) {
      extensions.push(token.slice(1))
      continue
    }

    const wildcard = MIME_WILDCARD_EXTENSIONS[token]
    if (wildcard) {
      extensions.push(...wildcard)
      continue
    }

    // specific mime like "application/epub+zip" -- best-effort extension lookup
    const ext = token.split("/")[1]?.replace(/\+.*$/, "")
    if (ext) {
      extensions.push(ext)
    }
  }

  if (extensions.length === 0) return undefined

  return [{ name: "Files", extensions }]
}

export function ServerFileBrowserTauri(
  props: ServerFileBrowserProps & {
    variant?: React.ComponentProps<typeof Button>["variant"]
    size?: React.ComponentProps<typeof Button>["size"]
    children?: React.ReactNode
  },
) {
  const {
    accept,
    directoriesOnly,
    startPath,
    className,
    variant = "ghost",
    size = "sm",
    children,
    ...rest
  } = props

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={async () => {
        const filters = acceptToTauriFilters(accept)

        const result = await open({
          directory: directoriesOnly,
          defaultPath: startPath,
          fileAccessMode: "scoped",
          multiple: rest.multiple,
          filters,
        })

        if (!result) return

        if (rest.multiple) {
          const paths: string[] = Array.isArray(result) ? result : [result]

          rest.onChange(
            paths.map((p) => ({
              path: p,
              name: p.split("/").pop() ?? p,
              isDirectory: false as const,
              size: 0,
              updatedAt: new Date().toISOString(),
            })),
          )
        } else {
          const selected = Array.isArray(result)
            ? (result[0] as string | undefined)
            : result

          if (selected) rest.onSelect(selected)
        }
      }}
    >
      {children ?? (
        <>
          <icon.Folder className="h-3.5 w-3.5" /> Open in file explorer
        </>
      )}
    </Button>
  )
}

export async function openTauriFileDialog(options: {
  directory?: boolean
  defaultPath?: string
  multiple?: boolean
  accept?: string
  filters?: { name: string; extensions: string[] }[]
}): Promise<string | string[] | null> {
  const filters = options.filters ?? acceptToTauriFilters(options.accept)

  if (options.multiple) {
    return await open({
      directory: options.directory,
      defaultPath: options.defaultPath,
      fileAccessMode: "scoped",
      multiple: true,
      filters,
    })
  }

  return await open({
    directory: options.directory,
    defaultPath: options.defaultPath,
    fileAccessMode: "scoped",
    multiple: false,
    filters,
  })
}

export function ServerFileBrowser(props: ServerFileBrowserProps) {
  const isTauri = useIsTauri()

  return isTauri ? (
    <ServerFileBrowserTauri {...props} />
  ) : (
    <ServerFileBrowserWeb {...props} />
  )
}
