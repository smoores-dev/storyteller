import React, { type ReactNode, useMemo, useState } from "react"

import { type StudioConfig, fileFor, isMarkdownFile } from "../config"
import { type LineRange, collapseContext, computeLineDiff } from "../diff/lines"

import {
  hint,
  panel,
  panelHeader,
  panelTitle,
  segment,
  segmented,
} from "./classes"

export interface DiffEntry {
  repoPath: string
  kind: "added" | "modified" | "deleted" | "renamed"
  renamedFrom?: string
  before: string | null
  after: string | null
  binaryUrl?: string | null
}

export type DiffMode = "unified" | "rendered"

export type RenderPreview = (
  source: string,
  file: string,
  highlight: LineRange[],
) => ReactNode

export function UnifiedDiff({
  before,
  after,
}: {
  before: string
  after: string
}) {
  const diff = useMemo(() => computeLineDiff(before, after), [before, after])
  const rows = useMemo(() => collapseContext(diff.rows), [diff])
  if (diff.added === 0 && diff.removed === 0) {
    return <p className={hint}>No textual changes.</p>
  }
  return (
    <table className="studio-diff border-collapse font-mono text-[12px] leading-5">
      <tbody>
        {rows.map((row, index) =>
          row.kind === "skip" ? (
            <tr key={index} data-kind="skip" className="text-faint">
              <td colSpan={3} className="px-3 py-0.5 italic">
                … {row.count} unchanged lines
              </td>
            </tr>
          ) : (
            <tr key={index} data-kind={row.kind}>
              <td className="text-faint w-10 px-2 text-right select-none">
                {row.oldLine ?? ""}
              </td>
              <td className="text-faint w-10 px-2 text-right select-none">
                {row.newLine ?? ""}
              </td>
              <td className="pr-2 break-words whitespace-pre-wrap">
                <span className="text-faint inline-block w-4 select-none">
                  {row.kind === "added"
                    ? "+"
                    : row.kind === "removed"
                      ? "−"
                      : " "}
                </span>
                {row.text}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  )
}

const KIND_LETTER = {
  added: { letter: "A", className: "text-success" },
  modified: { letter: "M", className: "text-warn" },
  deleted: { letter: "D", className: "text-danger" },
  renamed: { letter: "R", className: "text-warn" },
} as const

export function DiffPanel({
  entries,
  config,
  renderPreview,
  title,
  emptyMessage = "No changes.",
  actions,
}: {
  entries: DiffEntry[]
  config: StudioConfig
  renderPreview: RenderPreview
  title: ReactNode
  emptyMessage?: string
  actions?: ReactNode
}) {
  const [mode, setMode] = useState<DiffMode>("unified")
  const [selected, setSelected] = useState<string | null>(null)
  const active =
    entries.find((entry) => entry.repoPath === selected) ?? entries[0] ?? null
  return (
    <section className={panel}>
      <header className={panelHeader}>
        <h2 className={panelTitle}>{title}</h2>
        <div className="flex items-center gap-2">
          {actions}
          <div className={segmented} role="tablist">
            <button
              type="button"
              role="tab"
              className={segment}
              aria-selected={mode === "unified"}
              onClick={() => setMode("unified")}
            >
              Text
            </button>
            <button
              type="button"
              role="tab"
              className={segment}
              aria-selected={mode === "rendered"}
              onClick={() => setMode("rendered")}
            >
              Rendered
            </button>
          </div>
        </div>
      </header>
      {entries.length === 0 ? (
        <p className={`p-3 ${hint}`}>{emptyMessage}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]">
          <ul className="border-line m-0 list-none overflow-auto border-r p-0 max-md:max-h-32 max-md:border-r-0 max-md:border-b">
            {entries.map((entry) => {
              const kind = KIND_LETTER[entry.kind]
              return (
                <li key={entry.repoPath}>
                  <button
                    type="button"
                    aria-current={entry === active}
                    className="hover:bg-hover aria-[current=true]:bg-hover flex w-full items-center gap-2 truncate px-3 py-1.5 text-left text-[13px] aria-[current=true]:font-medium"
                    onClick={() => setSelected(entry.repoPath)}
                  >
                    <span
                      className={`w-3 font-mono text-[11px] font-bold ${kind.className}`}
                    >
                      {kind.letter}
                    </span>
                    <span className="truncate">
                      {fileFor(config, entry.repoPath) ?? entry.repoPath}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {active && (
            <DiffBody
              entry={active}
              mode={mode}
              config={config}
              renderPreview={renderPreview}
            />
          )}
        </div>
      )}
    </section>
  )
}

function DiffBody({
  entry,
  mode,
  config,
  renderPreview,
}: {
  entry: DiffEntry
  mode: DiffMode
  config: StudioConfig
  renderPreview: RenderPreview
}) {
  const file = fileFor(config, entry.repoPath) ?? entry.repoPath
  const textual = isMarkdownFile(entry.repoPath)
  const diff = useMemo(
    () =>
      textual ? computeLineDiff(entry.before ?? "", entry.after ?? "") : null,
    [textual, entry.before, entry.after],
  )
  if (!textual) {
    return (
      <div className="overflow-auto p-3">
        <p className={hint}>
          Binary file {entry.kind}
          {entry.renamedFrom
            ? ` from ${fileFor(config, entry.renamedFrom) ?? entry.renamedFrom}`
            : ""}
          .
        </p>
        {entry.binaryUrl && (
          <img
            src={entry.binaryUrl}
            alt={file}
            className="border-line mt-2 max-h-[60vh] max-w-full rounded-md border"
          />
        )}
      </div>
    )
  }
  if (mode === "unified") {
    return (
      <div className="overflow-auto">
        {entry.renamedFrom && (
          <p className={`px-3 pt-2 ${hint}`}>
            Moved from{" "}
            <code className="font-mono">
              {fileFor(config, entry.renamedFrom) ?? entry.renamedFrom}
            </code>
          </p>
        )}
        <UnifiedDiff before={entry.before ?? ""} after={entry.after ?? ""} />
      </div>
    )
  }
  return (
    <div className="grid min-h-0 grid-cols-2 max-md:grid-cols-1">
      <div className="border-line flex min-h-0 flex-col border-r">
        <div className="border-line bg-raised text-muted border-b px-3 py-1 text-[12px] tracking-wide uppercase">
          Before
        </div>
        {entry.before === null ? (
          <p className={`p-3 ${hint}`}>New file.</p>
        ) : (
          renderPreview(entry.before, file, diff?.changedOld ?? [])
        )}
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="border-line bg-raised text-muted border-b px-3 py-1 text-[12px] tracking-wide uppercase">
          After
        </div>
        {entry.after === null ? (
          <p className={`p-3 ${hint}`}>Deleted.</p>
        ) : (
          renderPreview(entry.after, file, diff?.changedNew ?? [])
        )}
      </div>
    </div>
  )
}
