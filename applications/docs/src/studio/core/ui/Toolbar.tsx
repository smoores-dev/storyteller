import type { EditorView } from "@codemirror/view"
import React, {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react"

import {
  ensureImports,
  insertSnippet,
  prefixLines,
  wrapSelection,
} from "../editor/commands"
import {
  ADMONITION_TYPES,
  SNIPPETS,
  TABS_IMPORTS,
  admonitionTemplate,
} from "../editor/snippets"

import type { EditorHandle } from "./Editor"
import { iconButton } from "./classes"

interface ToolbarProps {
  editorRef: RefObject<EditorHandle>
  format: "md" | "mdx"
  disabled?: boolean
  onImage: () => void
  onLink: () => void
  onFormat: () => void
  formatting?: boolean
  onBlame?: () => void
  blameOn?: boolean
  trailing?: ReactNode
}

function Icon({ d, label }: { d: string; label: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <title>{label}</title>
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z",
  italic: "M14 5h5M5 19h5M15 5l-6 14",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5a1 1 0 1 0 0-.01",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  numbered:
    "M10 6h10M10 12h10M10 18h10M4 6h1v4M4 10h2M4 14h2a1 1 0 0 1 0 2l-2 2h2",
  quote:
    "M6 15a3 3 0 0 1 3-3h1V8H6a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1zM14 15a3 3 0 0 1 3-3h1V8h-4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1z",
  codeBlock: "M4 4h16v16H4zM9 9l-2 3 2 3M15 9l2 3-2 3",
  table: "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14",
  callout: "M12 8v4M12 16h.01M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0",
  heading: "M6 5v14M18 5v14M6 12h12",
  tabs: "M3 7h18v12H3zM3 7V5h6v2M11 7V5h6v2",
  details: "M6 9l6 6 6-6",
  format: "M4 7h16M4 12h10M4 17h16",
  blame: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2M21 3l-4 4M21 7V3h-4",
} as const

function MenuButton({
  label,
  icon,
  disabled,
  children,
}: {
  label: string
  icon: ReactNode
  disabled?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={iconButton}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        <span aria-hidden="true" className="text-[10px]">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="border-line bg-raised absolute top-full left-0 z-20 mt-1 flex min-w-40 flex-col rounded-md border py-1 shadow-lg"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  onSelect,
  children,
}: {
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="text-ink hover:bg-hover px-3 py-1.5 text-left text-[13px]"
      onClick={onSelect}
    >
      {children}
    </button>
  )
}

function setHeading(view: EditorView, level: number) {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const text = line.text.replace(/^#{1,6}\s+/, "")
  if (text.trim() === "") {
    insertSnippet(view, `${"#".repeat(level)} \${1:Heading}\n\n\${2}`)
    return
  }
  const next = `${"#".repeat(level)} ${text}`
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: next },
    selection: { anchor: line.from + next.length },
  })
  view.focus()
}

export function Toolbar({
  editorRef,
  format,
  disabled = false,
  onImage,
  onLink,
  onFormat,
  formatting = false,
  onBlame,
  blameOn = false,
  trailing,
}: ToolbarProps) {
  const withView = (run: (view: EditorView) => void) => () => {
    const view = editorRef.current?.view()
    if (view) run(view)
  }
  const snippetById = (id: string) =>
    SNIPPETS.find((candidate) => candidate.id === id)?.template ?? ""
  const tool = (
    label: string,
    icon: keyof typeof ICONS,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className={iconButton}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon d={ICONS[icon]} label={label} />
    </button>
  )
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="border-line bg-raised flex flex-wrap items-center gap-0.5 border-b px-2 py-1"
    >
      <MenuButton
        label="Heading"
        icon={<Icon d={ICONS.heading} label="Heading" />}
        disabled={disabled}
      >
        {(close) =>
          [2, 3, 4].map((level) => (
            <MenuItem
              key={level}
              onSelect={() => {
                close()
                withView((view) => setHeading(view, level))()
              }}
            >
              Heading {level}
            </MenuItem>
          ))
        }
      </MenuButton>
      {tool(
        "Bold",
        "bold",
        withView((view) => wrapSelection(view, "**", "**", "bold text")),
      )}
      {tool(
        "Italic",
        "italic",
        withView((view) => wrapSelection(view, "_", "_", "italic text")),
      )}
      {tool(
        "Inline code",
        "code",
        withView((view) => wrapSelection(view, "`", "`", "code")),
      )}
      <span className="bg-line mx-1 h-5 w-px" aria-hidden="true" />
      {tool("Link to a page", "link", onLink)}
      {tool("Insert image", "image", onImage)}
      <span className="bg-line mx-1 h-5 w-px" aria-hidden="true" />
      {tool(
        "Bullet list",
        "list",
        withView((view) => prefixLines(view, "- ")),
      )}
      {tool(
        "Numbered list",
        "numbered",
        withView((view) => prefixLines(view, (index) => `${index + 1}. `)),
      )}
      {tool(
        "Quote",
        "quote",
        withView((view) => prefixLines(view, "> ")),
      )}
      <span className="bg-line mx-1 h-5 w-px" aria-hidden="true" />
      <MenuButton
        label="Admonition"
        icon={<Icon d={ICONS.callout} label="Admonition" />}
        disabled={disabled}
      >
        {(close) =>
          ADMONITION_TYPES.map((type) => (
            <MenuItem
              key={type}
              onSelect={() => {
                close()
                withView((view) =>
                  insertSnippet(view, admonitionTemplate(type)),
                )()
              }}
            >
              {type[0]!.toUpperCase()}
              {type.slice(1)}
            </MenuItem>
          ))
        }
      </MenuButton>
      {tool(
        "Code block",
        "codeBlock",
        withView((view) => insertSnippet(view, snippetById("code"))),
      )}
      {tool(
        "Table",
        "table",
        withView((view) => insertSnippet(view, snippetById("table"))),
      )}
      {tool(
        "Collapsible details",
        "details",
        withView((view) => insertSnippet(view, snippetById("details"))),
      )}
      {format === "mdx" &&
        tool(
          "Tabs",
          "tabs",
          withView((view) => {
            insertSnippet(view, snippetById("tabs"))
            ensureImports(view, TABS_IMPORTS)
          }),
        )}
      <span className="bg-line mx-1 h-5 w-px" aria-hidden="true" />
      <button
        type="button"
        className={iconButton}
        title="Format with Prettier"
        aria-label="Format with Prettier"
        disabled={disabled || formatting}
        onClick={onFormat}
      >
        <Icon d={ICONS.format} label="Format" />
        <span className="text-[12px]">
          {formatting ? "Formatting…" : "Format"}
        </span>
      </button>
      {onBlame && (
        <button
          type="button"
          className={`${iconButton} aria-pressed:text-primary`}
          title="Show who last changed each line"
          aria-label="Show who last changed each line"
          aria-pressed={blameOn}
          disabled={disabled}
          onClick={onBlame}
        >
          <Icon d={ICONS.blame} label="Blame" />
          <span className="text-[12px]">Blame</span>
        </button>
      )}
      <span className="text-faint ml-auto flex items-center gap-2 text-[12px]">
        <span className="hidden md:inline">Type / for blocks</span>
        {trailing}
      </span>
    </div>
  )
}
