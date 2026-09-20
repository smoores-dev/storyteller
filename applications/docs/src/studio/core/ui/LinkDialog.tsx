import React, { useEffect, useMemo, useState } from "react"

import { basename, dirname, isMarkdownFile, relativePath } from "../config"
import { type HeadingInfo, extractHeadings } from "../editor/headings"
import { titleOf } from "../frontmatter"

import {
  button,
  buttonPrimary,
  hint,
  input,
  label as labelClass,
} from "./classes"
import { Modal } from "./dialogs"

export function LinkDialog({
  currentFile,
  files,
  loadFile,
  initialText,
  onInsert,
  onClose,
}: {
  currentFile: string
  files: string[]
  loadFile: (file: string) => Promise<string | null>
  initialText: string
  onInsert: (markdown: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<string | null>(null)
  const [headings, setHeadings] = useState<HeadingInfo[] | null>(null)
  const [heading, setHeading] = useState<string>("")
  const [text, setText] = useState(initialText)
  const [textTouched, setTextTouched] = useState(initialText !== "")
  const pages = useMemo(
    () => files.filter((file) => isMarkdownFile(file)),
    [files],
  )
  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    return pages
      .filter((file) =>
        terms.every((term) => file.toLowerCase().includes(term)),
      )
      .slice(0, 60)
  }, [pages, query])

  useEffect(() => {
    if (!picked) {
      setHeadings(null)
      return
    }
    let cancelled = false
    setHeadings(null)
    const source = picked === currentFile ? null : picked
    const load = source ? loadFile(source) : Promise.resolve(null)
    load.then((content) => {
      if (cancelled) return
      if (content === null) {
        setHeadings([])
        return
      }
      setHeadings(extractHeadings(content))
      if (!textTouched) setText(titleOf(content, picked))
    })
    return () => {
      cancelled = true
    }
  }, [picked, currentFile, loadFile, textTouched])

  const href = picked
    ? `${picked === currentFile ? "" : relativePath(currentFile, picked)}${heading ? `#${heading}` : ""}`
    : ""
  const valid = href !== "" && text.trim() !== ""

  return (
    <Modal title="Link to a page" onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          <label className={labelClass}>
            Search pages
            <input
              className={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="file name or folder"
              autoFocus
            />
          </label>
          <ul
            className="border-line m-0 max-h-72 list-none overflow-auto rounded-md border p-0"
            role="listbox"
            aria-label="Pages"
          >
            {results.map((file) => (
              <li key={file}>
                <button
                  type="button"
                  role="option"
                  aria-selected={picked === file}
                  className="hover:bg-hover aria-selected:bg-primary aria-selected:text-on-primary flex w-full flex-col items-start px-2 py-1 text-left"
                  onClick={() => {
                    setPicked(file)
                    setHeading("")
                  }}
                >
                  <span className="text-[13px]">{basename(file)}</span>
                  <span className="text-[11px] opacity-70">
                    {dirname(file)}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className={`px-2 py-1 ${hint}`}>No pages match.</li>
            )}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>
            Link text
            <input
              className={input}
              value={text}
              onChange={(event) => {
                setTextTouched(true)
                setText(event.target.value)
              }}
            />
          </label>
          <label className={labelClass}>
            Section (optional)
            <select
              className={input}
              value={heading}
              disabled={!picked || headings === null}
              onChange={(event) => setHeading(event.target.value)}
            >
              <option value="">Top of the page</option>
              {(headings ?? []).map((item) => (
                <option key={`${item.slug}-${item.line}`} value={item.slug}>
                  {"  ".repeat(Math.max(0, item.level - 1))}
                  {item.text}
                </option>
              ))}
            </select>
          </label>
          <p className={hint}>
            {picked ? (
              <>
                Inserts{" "}
                <code className="bg-raised rounded px-1 font-mono text-[12px]">
                  [{text || "text"}]({href})
                </code>
              </>
            ) : (
              "Pick a page on the left."
            )}
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={!valid}
          onClick={() => onInsert(`[${text.trim()}](${href})`)}
        >
          Insert link
        </button>
      </div>
    </Modal>
  )
}
