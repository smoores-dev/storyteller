import React, {
  type DragEvent,
  type ReactNode,
  memo,
  useMemo,
  useState,
} from "react"

import { basename, dirname, isMarkdownFile } from "../config"
import {
  type OutlineItem,
  type OutlineVersion,
  type SidebarOutline,
  outlineFiles,
} from "../model/outline"
import {
  type ItemPath,
  type SidebarJsonItem,
  type SidebarsJson,
  displayLabel,
  docIdForFile,
  fileForDocId,
  getAt,
  insertAt,
  itemId,
  moveItem,
  newCategory,
  referencedIds,
  removeAt,
  sidebarDestinations,
  type SidebarDestination,
  updateAt,
} from "../model/sidebars"

import { segment, segmented } from "./classes"
import { SidebarPlaceDialog } from "./dialogs"
import type { TreeFile } from "./hooks"
import type { SidebarModel } from "./sidebarModels"

export type TreeView = "files" | "sidebar"

interface TreeNode {
  name: string
  path: string
  children: TreeNode[]
  file: TreeFile | null
}

function kindOf(path: string): TreeFile["kind"] {
  if (isMarkdownFile(path)) return "markdown"
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(path)) return "image"
  return "other"
}

function buildTree(files: TreeFile[], extraPaths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: [], file: null }
  const insert = (file: TreeFile | null, path: string) => {
    const parts = path.split("/")
    let node = root
    parts.forEach((part, index) => {
      const childPath = parts.slice(0, index + 1).join("/")
      let child = node.children.find((candidate) => candidate.name === part)
      if (!child) {
        child = { name: part, path: childPath, children: [], file: null }
        node.children.push(child)
      }
      if (index === parts.length - 1)
        child.file ??= file ?? {
          file: path,
          repoPath: "",
          blobId: "",
          kind: kindOf(path),
        }
      node = child
    })
  }
  for (const file of files) insert(file, file.file)
  for (const path of extraPaths) {
    if (!files.some((file) => file.file === path)) insert(null, path)
  }
  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => {
      const aDir = a.children.length > 0 ? 0 : 1
      const bDir = b.children.length > 0 ? 0 : 1
      return aDir - bDir || a.name.localeCompare(b.name)
    })
    node.children.forEach(sort)
  }
  sort(root)
  return root
}

const ICON_PATHS = {
  md: "M4 2.5h5.5L13 6v7.5H4zM9 2.5V6h3.5M5.5 9h5M5.5 11h5",
  mdx: "M4 2.5h5.5L13 6v7.5H4zM9 2.5V6h3.5M6.5 8.5 5 10l1.5 1.5M9.5 8.5 11 10l-1.5 1.5",
  image: "M3 3.5h10v9H3zM3 10l3-3 2.5 2.5L10 8l3 3M10.5 5.5h.01",
  json: "M6 3c-1.5 0-2 .7-2 2v1.5c0 .8-.5 1.5-1.5 1.5 1 0 1.5.7 1.5 1.5V11c0 1.3.5 2 2 2M10 3c1.5 0 2 .7 2 2v1.5c0 .8.5 1.5 1.5 1.5-1 0-1.5.7-1.5 1.5V11c0 1.3-.5 2-2 2",
  folder: "M2 4.5h4l1.5 1.5H14v7H2z",
  link: "M6.5 9.5l3-3M7.5 5.5l1-1a2.1 2.1 0 0 1 3 3l-1 1M8.5 10.5l-1 1a2.1 2.1 0 0 1-3-3l1-1",
  version: "M3 4.5h10M3 8h10M3 11.5h6",
  move: "M2.5 8h9M8.5 5l3 3-3 3",
  up: "M8 12V4M4.5 7.5 8 4l3.5 3.5",
  down: "M8 4v8M4.5 8.5 8 12l3.5-3.5",
  remove: "M4 4l8 8M12 4l-8 8",
  rename: "M3 13h3l7-7-3-3-7 7zM9 4l3 3",
  plus: "M8 3v10M3 8h10",
  pagePlus: "M4 2.5h5.5L13 6v7.5H4zM9 2.5V6h3.5M8.5 8v4M6.5 10h4",
  library: "M3 3h3v10H3zM7 3h3v10H7zM11.5 3.5l2.5.7-2.3 9-2.5-.7z",
  category: "M2 4.5h4l1.5 1.5H14v7H2zM6 9.5h4M8.5 8l1.5 1.5L8.5 11",
  sidebarAdd: "M3 4.5h10M3 8h5M3 11.5h5M11.5 9v4M9.5 11h4",
} as const

export type IconKind = keyof typeof ICON_PATHS

export function FileIcon({
  kind,
  className = "",
}: {
  kind: IconKind
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON_PATHS[kind]} />
    </svg>
  )
}

export function fileIconKind(path: string): IconKind {
  const lower = path.toLowerCase()
  if (lower.endsWith(".mdx")) return "mdx"
  if (lower.endsWith(".md")) return "md"
  if (kindOf(path) === "image") return "image"
  return "json"
}

type DropZone = "before" | "after" | "into"

interface DropSpec {
  zones: DropZone[]
  onDrop: (zone: DropZone, transfer: DataTransfer) => void
}

interface RowOptions {
  kind?: TreeFile["kind"]
  missing?: boolean
  hint?: string
  controls?: ReactNode
  dragData?: [string, string]
  drop?: DropSpec
  rowKey?: string
}

interface FolderOptions {
  icon?: IconKind
  onSelect?: () => void
  controls?: ReactNode
  dragData?: [string, string]
  drop?: DropSpec
  label?: ReactNode
}

export interface NewPageTarget {
  modelKey: string
  sidebarId: string
  destination: ItemPath
  directory: string
}

interface FileTreeProps {
  files: TreeFile[]
  selected: string | null
  changed: Set<string>
  deleted: Set<string>
  newFiles: string[]
  outline: SidebarOutline
  models: SidebarModel[]
  view: TreeView
  onViewChange: (view: TreeView) => void
  onSelect: (file: string) => void
  onNewFile?: (directory: string) => void
  onNewPage?: (target: NewPageTarget) => void
  onMove?: (file: string) => void
  onDrop?: (file: string, directory: string) => void
  onSidebarEdit?: (repoPath: string, sidebars: SidebarsJson) => void
  showImages: boolean
}

const FILE_DRAG = "text/x-studio-file"
const SIDEBAR_DRAG = "text/x-studio-sidebar"

const ROW_SELECTED =
  "has-[button[aria-current=true]]:bg-primary has-[button[aria-current=true]]:text-on-primary"
const CONTROL =
  "text-faint hover:bg-hover hover:text-ink rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100"

interface DragRef {
  key: string
  sidebarId: string
  path: ItemPath
}

export const FileTree = memo(function FileTree({
  files,
  selected,
  changed,
  deleted,
  newFiles,
  outline,
  models,
  view,
  onViewChange,
  onSelect,
  onNewFile,
  onNewPage,
  onMove,
  onDrop,
  onSidebarEdit,
  showImages,
}: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [dropHint, setDropHint] = useState<{
    key: string
    zone: DropZone
  } | null>(null)
  const [renaming, setRenaming] = useState<{
    key: string
    value: string
  } | null>(null)
  const [placing, setPlacing] = useState<{
    model: SidebarModel
    sidebars: SidebarsJson
    sourceId: string | null
    from: ItemPath | null
    item: SidebarJsonItem
    page: string
    destinations: SidebarDestination[]
  } | null>(null)
  const openPlacing = (
    model: SidebarModel,
    sidebars: SidebarsJson,
    sourceId: string | null,
    from: ItemPath | null,
    item: SidebarJsonItem,
    page: string,
  ) => {
    const ids = Object.keys(sidebars)
    const destinations = ids
      .flatMap((id) =>
        sidebarDestinations(
          sidebars[id] ?? [],
          id,
          ids.length > 1 ? id : "Top level",
        ),
      )
      .filter(
        (destination) =>
          from === null ||
          destination.sidebarId !== sourceId ||
          destination.path.length <= from.length ||
          !from.every(
            (index, position) => destination.path[position] === index,
          ),
      )
    setPlacing({ model, sidebars, sourceId, from, item, page, destinations })
  }
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const allFiles = useMemo(() => {
    const set = new Set(files.map((file) => file.file))
    for (const file of newFiles) set.add(file)
    return set
  }, [files, newFiles])

  const dropHandlers = (rowKey: string, drop: DropSpec | undefined) => {
    if (!drop) return {}
    return {
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        const types = Array.from(event.dataTransfer.types)
        if (!types.includes(FILE_DRAG) && !types.includes(SIDEBAR_DRAG)) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = "move"
        const rect = event.currentTarget.getBoundingClientRect()
        const offset = (event.clientY - rect.top) / Math.max(rect.height, 1)
        let zone: DropZone
        if (drop.zones.includes("into")) {
          zone =
            offset < 0.25 && drop.zones.includes("before")
              ? "before"
              : offset > 0.75 && drop.zones.includes("after")
                ? "after"
                : "into"
        } else {
          zone = offset < 0.5 ? "before" : "after"
        }
        if (!drop.zones.includes(zone)) zone = drop.zones[0]!
        if (dropHint?.key !== rowKey || dropHint.zone !== zone)
          setDropHint({ key: rowKey, zone })
      },
      onDragLeave: () => {
        if (dropHint?.key === rowKey) setDropHint(null)
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        event.stopPropagation()
        const zone = dropHint?.key === rowKey ? dropHint.zone : drop.zones[0]!
        setDropHint(null)
        drop.onDrop(zone, event.dataTransfer)
      },
    }
  }

  const dropClass = (rowKey: string) => {
    if (dropHint?.key !== rowKey) return ""
    if (dropHint.zone === "into") return "bg-primary-soft"
    if (dropHint.zone === "before")
      return "shadow-[inset_0_2px_0_0_var(--color-primary)]"
    return "shadow-[inset_0_-2px_0_0_var(--color-primary)]"
  }

  const fileRow = (
    file: string,
    label: string,
    depth: number,
    options: RowOptions = {},
  ) => {
    const isSelected = selected === file
    const isChanged = changed.has(file)
    const isDeleted = deleted.has(file)
    const kind = options.kind ?? kindOf(file)
    const rowKey = options.rowKey ?? `file:${file}`
    const dragData =
      options.dragData ??
      (onDrop !== undefined && view === "files" ? [FILE_DRAG, file] : undefined)
    return (
      <li key={rowKey}>
        <div
          className={`group hover:bg-hover flex items-center pr-1 ${ROW_SELECTED} ${dropClass(rowKey)}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          draggable={dragData !== undefined}
          onDragStart={(event: DragEvent) => {
            if (!dragData) return
            event.dataTransfer.setData(dragData[0], dragData[1])
            event.dataTransfer.effectAllowed = "move"
          }}
          {...dropHandlers(rowKey, options.drop)}
        >
          <button
            type="button"
            className={`flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left text-[13px] ${kind === "image" ? "text-muted" : "text-ink"} group-has-[button[aria-current=true]]:text-on-primary ${isDeleted ? "line-through opacity-60" : ""} ${options.missing ? "opacity-50" : ""}`}
            aria-current={isSelected}
            title={options.hint ?? file}
            onClick={() => onSelect(file)}
          >
            <FileIcon kind={fileIconKind(file)} className="opacity-60" />
            <span className="truncate">{label}</span>
            {isChanged && (
              <span
                className="bg-primary group-has-[button[aria-current=true]]:bg-on-primary ml-auto h-2 w-2 shrink-0 rounded-full"
                aria-label="Changed"
              />
            )}
          </button>
          {options.controls}
          {onMove && !isDeleted && !options.missing && (
            <button
              type="button"
              className={CONTROL}
              title={`Move or rename ${basename(file)}`}
              aria-label={`Move or rename ${basename(file)}`}
              onClick={() => onMove(file)}
            >
              <FileIcon kind="move" />
            </button>
          )}
        </div>
      </li>
    )
  }

  const folderRow = (
    key: string,
    label: string,
    depth: number,
    dropDirectory: string | null,
    children: ReactNode,
    options: FolderOptions = {},
  ) => {
    const isCollapsed = collapsed.has(key)
    const directoryDrop: DropSpec | undefined =
      onDrop !== undefined && dropDirectory !== null
        ? {
            zones: ["into"],
            onDrop: (_zone, transfer) => {
              const file = transfer.getData(FILE_DRAG)
              if (file) onDrop(file, dropDirectory)
            },
          }
        : undefined
    const drop = options.drop ?? directoryDrop
    return (
      <li key={key}>
        <div
          className={`group flex items-center pr-1 ${dropClass(key)}`}
          style={{ paddingLeft: 8 + depth * 12 }}
          draggable={options.dragData !== undefined}
          onDragStart={(event: DragEvent) => {
            if (!options.dragData) return
            event.dataTransfer.setData(options.dragData[0], options.dragData[1])
            event.dataTransfer.effectAllowed = "move"
          }}
          {...dropHandlers(key, drop)}
        >
          <button
            type="button"
            className="text-faint hover:text-ink flex h-6 w-4 items-center justify-center"
            onClick={() => toggle(key)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
          >
            <span
              aria-hidden="true"
              className={`inline-block text-[10px] transition-transform ${isCollapsed ? "" : "rotate-90"}`}
            >
              ▶
            </span>
          </button>
          {options.label ?? (
            <button
              type="button"
              className="text-ink hover:text-primary flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left text-[13px] font-medium"
              onClick={options.onSelect ?? (() => toggle(key))}
            >
              <FileIcon
                kind={options.icon ?? "folder"}
                className="opacity-60"
              />
              <span className="truncate">{label}</span>
            </button>
          )}
          {options.controls}
          {onNewFile && dropDirectory !== null && (
            <button
              type="button"
              className={`${CONTROL} px-1.5 text-[14px] leading-none`}
              title={`New page in ${dropDirectory}`}
              aria-label={`New page in ${dropDirectory}`}
              onClick={() => onNewFile(dropDirectory)}
            >
              +
            </button>
          )}
        </div>
        {!isCollapsed && <ul className="m-0 list-none p-0">{children}</ul>}
      </li>
    )
  }

  const tree = useMemo(() => buildTree(files, newFiles), [files, newFiles])
  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    if (node.children.length > 0) {
      return folderRow(
        node.path,
        node.name,
        depth,
        node.path,
        node.children.map((child) => renderNode(child, depth + 1)),
      )
    }
    const file = node.file
    if (!file) return null
    if (file.kind !== "markdown" && !showImages) return null
    return fileRow(file.file, basename(file.file), depth + 1, {
      kind: file.kind,
    })
  }

  const inOutline = useMemo(() => outlineFiles(outline), [outline])
  const renderOutlineItems = (
    items: OutlineItem[],
    depth: number,
    keyPrefix: string,
  ): ReactNode =>
    items.map((item, index) => {
      const key = `${keyPrefix}/${index}`
      if (item.type === "doc") {
        return fileRow(item.file, item.label, depth, {
          missing: !allFiles.has(item.file),
          rowKey: key,
        })
      }
      if (item.type === "link") {
        return (
          <li key={key}>
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="text-muted hover:text-ink flex items-center gap-1.5 py-1 text-[13px]"
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              <FileIcon kind="link" className="opacity-60" />
              <span className="truncate">{item.label}</span>
            </a>
          </li>
        )
      }
      const file = item.file
      return folderRow(
        key,
        item.label,
        depth,
        null,
        renderOutlineItems(item.items, depth + 1, key),
        file ? { onSelect: () => onSelect(file) } : {},
      )
    })

  const renderEditableSidebar = (
    model: SidebarModel,
    sidebars: SidebarsJson,
    sidebarId: string,
    depth: number,
  ): {
    rows: ReactNode
    rootControls: ReactNode
    rootDrop: DropSpec | undefined
  } => {
    const version = model.version
    const items = sidebars[sidebarId] ?? []
    const known = new Map(version.docs.map((doc) => [doc.id, doc.file]))
    const titles = new Map(version.docs.map((doc) => [doc.id, doc.title]))
    const editable = onSidebarEdit !== undefined
    const commit = (next: SidebarJsonItem[]) =>
      onSidebarEdit?.(model.repoPath, { ...sidebars, [sidebarId]: next })
    const keyFor = (path: ItemPath) =>
      `${model.key}:${sidebarId}:${path.join(".")}`
    const parseDrag = (transfer: DataTransfer): DragRef | null => {
      const raw = transfer.getData(SIDEBAR_DRAG)
      if (!raw) return null
      try {
        return JSON.parse(raw) as DragRef
      } catch {
        return null
      }
    }
    const dropAt = (
      target: ItemPath,
      zone: DropZone,
      transfer: DataTransfer,
    ) => {
      const destination: ItemPath =
        zone === "before"
          ? target
          : zone === "after"
            ? [...target.slice(0, -1), target[target.length - 1]! + 1]
            : [...target, childCount(target)]
      const ref = parseDrag(transfer)
      if (ref) {
        if (ref.key !== model.key) return
        if (ref.sidebarId === sidebarId) {
          commit(moveItem(items, ref.path, destination))
          return
        }
        const { items: remaining, removed } = removeAt(
          sidebars[ref.sidebarId] ?? [],
          ref.path,
        )
        if (!removed) return
        onSidebarEdit?.(model.repoPath, {
          ...sidebars,
          [ref.sidebarId]: remaining,
          [sidebarId]: insertAt(items, destination, removed),
        })
        return
      }
      const file = transfer.getData(FILE_DRAG)
      const id = file ? docIdForFile(version.contentPath, file) : null
      if (!id || referencedIds(items).has(id)) return
      commit(insertAt(items, destination, id))
    }
    const directoryFor = (list: SidebarJsonItem[]): string | null => {
      for (const item of list) {
        const id = itemId(item)
        if (id === null) continue
        const file = fileForDocId(version.contentPath, id, allFiles, known)
        if (file) return dirname(file)
      }
      for (const item of list) {
        if (typeof item !== "string" && item.type === "category") {
          const found = directoryFor(item.items)
          if (found) return found
        }
      }
      return null
    }
    const newPageButton = (destination: ItemPath, list: SidebarJsonItem[]) =>
      onNewPage ? (
        <button
          type="button"
          className={CONTROL}
          title="New page here"
          aria-label="New page here"
          onClick={() =>
            onNewPage({
              modelKey: model.key,
              sidebarId,
              destination,
              directory: directoryFor(list) ?? version.contentPath,
            })
          }
        >
          <FileIcon kind="pagePlus" />
        </button>
      ) : null
    const childCount = (path: ItemPath) => {
      if (path.length === 0) return items.length
      const item = getAt(items, path)
      return typeof item !== "string" && item?.type === "category"
        ? item.items.length
        : 0
    }
    const controlsFor = (path: ItemPath, item: SidebarJsonItem) => {
      if (!editable) return null
      const parent = path.slice(0, -1)
      const index = path[path.length - 1]!
      const siblings = childCount(parent)
      const isCategory = typeof item !== "string" && item.type === "category"
      return (
        <span className="flex items-center">
          {isCategory && (
            <>
              {newPageButton([...path, item.items.length], item.items)}
              <button
                type="button"
                className={CONTROL}
                title="New category inside"
                aria-label="New category inside"
                onClick={() => {
                  const next = insertAt(
                    items,
                    [...path, item.items.length],
                    newCategory("New category"),
                  )
                  commit(next)
                  setRenaming({
                    key: keyFor([...path, item.items.length]),
                    value: "New category",
                  })
                }}
              >
                <FileIcon kind="plus" />
              </button>
              <button
                type="button"
                className={CONTROL}
                title="Rename category"
                aria-label="Rename category"
                onClick={() =>
                  setRenaming({ key: keyFor(path), value: item.label })
                }
              >
                <FileIcon kind="rename" />
              </button>
            </>
          )}
          <button
            type="button"
            className={CONTROL}
            title="Move to another category"
            aria-label="Move to another category"
            onClick={() =>
              openPlacing(
                model,
                sidebars,
                sidebarId,
                path,
                item,
                displayLabel(item, (docId) => titles.get(docId) ?? null),
              )
            }
          >
            <FileIcon kind="category" />
          </button>
          <button
            type="button"
            className={CONTROL}
            title="Move up"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() =>
              commit(moveItem(items, path, [...parent, index - 1]))
            }
          >
            <FileIcon kind="up" />
          </button>
          <button
            type="button"
            className={CONTROL}
            title="Move down"
            aria-label="Move down"
            disabled={index >= siblings - 1}
            onClick={() =>
              commit(moveItem(items, path, [...parent, index + 2]))
            }
          >
            <FileIcon kind="down" />
          </button>
          <button
            type="button"
            className={CONTROL}
            title={
              isCategory
                ? "Remove category and its items from the sidebar"
                : "Remove from the sidebar"
            }
            aria-label="Remove from the sidebar"
            onClick={() => commit(removeAt(items, path).items)}
          >
            <FileIcon kind="remove" />
          </button>
        </span>
      )
    }
    const renderItems = (
      list: SidebarJsonItem[],
      parent: ItemPath,
    ): ReactNode =>
      list.map((item, index) => {
        const path = [...parent, index]
        const key = keyFor(path)
        const rowDepth = depth + path.length
        const dragData: [string, string] | undefined = editable
          ? [
              SIDEBAR_DRAG,
              JSON.stringify({
                key: model.key,
                sidebarId,
                path,
              } satisfies DragRef),
            ]
          : undefined
        const id = itemId(item)
        if (id !== null) {
          const file = fileForDocId(version.contentPath, id, allFiles, known)
          return fileRow(
            file ?? `${version.contentPath}/${id}.md`,
            displayLabel(item, (docId) => titles.get(docId) ?? null),
            rowDepth,
            {
              missing: file === null || !allFiles.has(file),
              hint: file ?? `${id} (no file for this id on this branch)`,
              rowKey: key,
              controls: controlsFor(path, item),
              dragData,
              drop: editable
                ? {
                    zones: ["before", "after"],
                    onDrop: (zone, transfer) => dropAt(path, zone, transfer),
                  }
                : undefined,
            },
          )
        }
        if (typeof item !== "string" && item.type === "category") {
          const isRenaming = renaming?.key === key
          const linkedId = (
            item.link as { type?: string; id?: string } | undefined
          )?.id
          const linkedFile =
            linkedId && linkedId.length > 0
              ? fileForDocId(version.contentPath, linkedId, allFiles, known)
              : null
          return folderRow(
            key,
            item.label,
            rowDepth,
            null,
            renderItems(item.items, path),
            {
              controls: controlsFor(path, item),
              dragData,
              onSelect: linkedFile ? () => onSelect(linkedFile) : undefined,
              drop: editable
                ? {
                    zones: ["before", "after", "into"],
                    onDrop: (zone, transfer) => dropAt(path, zone, transfer),
                  }
                : undefined,
              label: isRenaming ? (
                <input
                  className="border-line-strong bg-surface text-ink my-0.5 min-w-0 flex-1 rounded border px-1 py-0.5 text-[13px]"
                  value={renaming.value}
                  autoFocus
                  aria-label="Category label"
                  onChange={(event) =>
                    setRenaming({ key, value: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const label = renaming.value.trim()
                      if (label) {
                        commit(
                          updateAt(items, path, (current) =>
                            typeof current === "string"
                              ? current
                              : { ...current, label },
                          ),
                        )
                      }
                      setRenaming(null)
                    }
                    if (event.key === "Escape") setRenaming(null)
                  }}
                  onBlur={() => setRenaming(null)}
                />
              ) : undefined,
            },
          )
        }
        if (typeof item !== "string" && item.type === "link") {
          return (
            <li key={key}>
              <div
                className={`group flex items-center pr-1 ${dropClass(key)}`}
                style={{ paddingLeft: 8 + rowDepth * 12 }}
                draggable={dragData !== undefined}
                onDragStart={(event: DragEvent) => {
                  if (!dragData) return
                  event.dataTransfer.setData(dragData[0], dragData[1])
                }}
                {...dropHandlers(
                  key,
                  editable
                    ? {
                        zones: ["before", "after"],
                        onDrop: (zone, transfer) =>
                          dropAt(path, zone, transfer),
                      }
                    : undefined,
                )}
              >
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-ink flex min-w-0 flex-1 items-center gap-1.5 py-1 text-[13px]"
                >
                  <FileIcon kind="link" className="opacity-60" />
                  <span className="truncate">{item.label}</span>
                </a>
                {controlsFor(path, item)}
              </div>
            </li>
          )
        }
        return (
          <li key={key}>
            <div
              className={`group text-muted flex items-center pr-1 text-[13px] italic ${dropClass(key)}`}
              style={{ paddingLeft: 8 + rowDepth * 12 }}
              {...dropHandlers(
                key,
                editable
                  ? {
                      zones: ["before", "after"],
                      onDrop: (zone, transfer) => dropAt(path, zone, transfer),
                    }
                  : undefined,
              )}
            >
              <span className="flex-1 truncate py-1">
                {displayLabel(item, () => null)}
              </span>
              {controlsFor(path, item)}
            </div>
          </li>
        )
      })
    const rootControls = editable ? (
      <span className="flex items-center">
        {newPageButton([items.length], items)}
        <button
          type="button"
          className={CONTROL}
          title="New category"
          aria-label="New category"
          onClick={() => {
            commit(insertAt(items, [items.length], newCategory("New category")))
            setRenaming({ key: keyFor([items.length]), value: "New category" })
          }}
        >
          <FileIcon kind="plus" />
        </button>
      </span>
    ) : null
    const rootDrop: DropSpec | undefined = editable
      ? {
          zones: ["into"],
          onDrop: (zone, transfer) => dropAt([], zone, transfer),
        }
      : undefined
    return { rows: renderItems(items, []), rootControls, rootDrop }
  }

  const renderVersion = (version: OutlineVersion) => {
    const prefix = `${version.contentPath}/`
    const key = `version:${version.pluginId}:${version.version}`
    const model = models.find(
      (candidate) =>
        candidate.version.pluginId === version.pluginId &&
        candidate.version.version === version.version,
    )
    const sidebars = model?.sidebars ?? null
    if (version.pluginId === "libraries") {
      return folderRow(
        key,
        version.title,
        0,
        null,
        version.docs
          .filter((doc) => doc.editFile)
          .map((doc) =>
            fileRow(doc.editFile!, doc.title, 1, {
              hint: `${doc.editFile} (the API reference is generated)`,
              rowKey: `${key}:${doc.id}`,
            }),
          ),
        { icon: "library" },
      )
    }
    const referenced = new Set<string>()
    if (sidebars) {
      for (const items of Object.values(sidebars)) {
        for (const id of referencedIds(items)) referenced.add(id)
      }
    }
    const extras = [...allFiles]
      .filter((file) => {
        if (!file.startsWith(prefix) || !isMarkdownFile(file)) return false
        if (deleted.has(file)) return false
        if (sidebars) {
          const id = docIdForFile(version.contentPath, file)
          return id !== null && !referenced.has(id)
        }
        return !inOutline.has(file)
      })
      .sort()
    const editable = sidebars !== null && onSidebarEdit !== undefined
    let body: ReactNode
    let rootControls: ReactNode = null
    let rootDrop: DropSpec | undefined
    if (sidebars && model) {
      const entries = Object.keys(sidebars)
      if (entries.length === 1) {
        const rendered = renderEditableSidebar(model, sidebars, entries[0]!, 0)
        body = rendered.rows
        rootControls = rendered.rootControls
        rootDrop = rendered.rootDrop
      } else {
        body = entries.map((sidebarId) => {
          const rendered = renderEditableSidebar(model, sidebars, sidebarId, 1)
          return folderRow(
            `${key}:${sidebarId}`,
            sidebarId,
            1,
            null,
            rendered.rows,
            {
              controls: rendered.rootControls,
              drop: rendered.rootDrop,
            },
          )
        })
      }
    } else {
      const sidebarEntries = Object.entries(version.sidebars)
      body = sidebarEntries.map(([sidebarId, items]) =>
        sidebarEntries.length > 1
          ? folderRow(
              `${key}:${sidebarId}`,
              sidebarId,
              1,
              null,
              renderOutlineItems(items, 2, `${key}:${sidebarId}`),
            )
          : renderOutlineItems(items, 1, `${key}:${sidebarId}`),
      )
    }
    return folderRow(
      key,
      version.title,
      0,
      null,
      <>
        {body}
        {extras.length > 0 &&
          folderRow(
            `${key}:extras`,
            "Not in the sidebar",
            1,
            null,
            extras.map((file) =>
              fileRow(file, file.slice(prefix.length), 2, {
                hint: editable
                  ? `${file} is not in the sidebar. Drag it into the tree above to add it.`
                  : `${file} is not in the sidebar.`,
                dragData: editable ? [FILE_DRAG, file] : undefined,
                controls:
                  editable && model && sidebars ? (
                    <button
                      type="button"
                      className={CONTROL}
                      title="Add to the sidebar"
                      aria-label="Add to the sidebar"
                      onClick={() => {
                        const id = docIdForFile(version.contentPath, file)
                        if (!id) return
                        openPlacing(
                          model,
                          sidebars,
                          null,
                          null,
                          id,
                          file.slice(prefix.length),
                        )
                      }}
                    >
                      <FileIcon kind="sidebarAdd" />
                    </button>
                  ) : undefined,
              }),
            ),
            { icon: "version" },
          )}
      </>,
      {
        icon: "version",
        controls: rootControls,
        drop: rootDrop,
        label: model?.local ? (
          <span className="text-ink flex min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-[13px] font-medium">
            <FileIcon kind="version" className="opacity-60" />
            <span className="truncate">{version.title}</span>
            <span
              className="bg-primary h-2 w-2 shrink-0 rounded-full"
              aria-label="Sidebar changed"
            />
          </span>
        ) : undefined,
      },
    )
  }

  const otherFiles = useMemo(() => {
    const prefixes = outline.versions.map(
      (version) => `${version.contentPath}/`,
    )
    return [...allFiles]
      .filter(
        (file) =>
          isMarkdownFile(file) &&
          !prefixes.some((prefix) => file.startsWith(prefix)),
      )
      .sort()
  }, [allFiles, outline])

  const hasOutline = outline.versions.length > 0
  return (
    <nav aria-label="Documentation files" className="text-[13px]">
      {hasOutline && (
        <div className="flex items-center px-2 pb-2">
          <div className={segmented} role="tablist" aria-label="Tree view">
            <button
              type="button"
              role="tab"
              className={segment}
              aria-selected={view === "sidebar"}
              onClick={() => onViewChange("sidebar")}
            >
              Sidebar
            </button>
            <button
              type="button"
              role="tab"
              className={segment}
              aria-selected={view === "files"}
              onClick={() => onViewChange("files")}
            >
              Files
            </button>
          </div>
        </div>
      )}
      <ul className="m-0 list-none p-0">
        {view === "files" || !hasOutline
          ? tree.children.map((child) => renderNode(child, 0))
          : [
              ...outline.versions.map(renderVersion),
              otherFiles.length > 0
                ? folderRow(
                    "other",
                    "Other pages",
                    0,
                    null,
                    otherFiles.map((file) =>
                      fileRow(file, file, 1, { hint: dirname(file) }),
                    ),
                    { icon: "version" },
                  )
                : null,
            ]}
      </ul>
      {placing !== null && (
        <SidebarPlaceDialog
          title={
            placing.from === null ? "Add to the sidebar" : "Move in the sidebar"
          }
          page={placing.page}
          confirmLabel={placing.from === null ? "Add" : "Move"}
          destinations={placing.destinations}
          onConfirm={(destination) => {
            const { model, sidebars, sourceId, from, item } = placing
            const target = sidebars[destination.sidebarId] ?? []
            setPlacing(null)
            if (from === null || sourceId === null) {
              onSidebarEdit?.(model.repoPath, {
                ...sidebars,
                [destination.sidebarId]: insertAt(
                  target,
                  destination.path,
                  item,
                ),
              })
              return
            }
            if (sourceId === destination.sidebarId) {
              onSidebarEdit?.(model.repoPath, {
                ...sidebars,
                [sourceId]: moveItem(target, from, destination.path),
              })
              return
            }
            const { items: remaining, removed } = removeAt(
              sidebars[sourceId] ?? [],
              from,
            )
            if (!removed) return
            onSidebarEdit?.(model.repoPath, {
              ...sidebars,
              [sourceId]: remaining,
              [destination.sidebarId]: insertAt(
                target,
                destination.path,
                removed,
              ),
            })
          }}
          onClose={() => setPlacing(null)}
        />
      )}
    </nav>
  )
})
