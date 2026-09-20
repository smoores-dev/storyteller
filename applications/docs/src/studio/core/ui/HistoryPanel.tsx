import React, { useCallback, useMemo, useState } from "react"

import {
  type StudioConfig,
  fileFor,
  isImageFile,
  isMarkdownFile,
} from "../config"
import type { GitLabClient, GitLabCommit } from "../gitlab/client"

import { type DiffEntry, DiffPanel, type RenderPreview } from "./DiffPanel"
import {
  button,
  errorText,
  hint,
  panel,
  panelHeader,
  panelTitle,
  segment,
  segmented,
} from "./classes"
import { describeError, useAsync } from "./hooks"

interface HistoryPanelProps {
  client: GitLabClient
  projectId: number
  branch: string
  defaultBranch: string
  upstreamProjectId: number
  scopePath: string | null
  config: StudioConfig
  renderPreview: RenderPreview
}

async function loadText(
  client: GitLabClient,
  projectId: number,
  ref: string,
  path: string,
) {
  try {
    return await client.getRawText(projectId, ref, path)
  } catch {
    return null
  }
}

async function entriesForCompare(
  client: GitLabClient,
  projectId: number,
  from: string,
  to: string,
  config: StudioConfig,
  fromProjectId?: number,
): Promise<DiffEntry[]> {
  const compare = await client.compare(projectId, from, to, fromProjectId)
  const relevant = compare.diffs.filter((diff) => {
    const path = diff.new_path || diff.old_path
    return (
      path.startsWith(`${config.docsRoot}/`) ||
      isMarkdownFile(path) ||
      isImageFile(path)
    )
  })
  return Promise.all(
    relevant.map(async (diff) => {
      const path = diff.new_path || diff.old_path
      const kind = diff.new_file
        ? "added"
        : diff.deleted_file
          ? "deleted"
          : "modified"
      if (!isMarkdownFile(path)) {
        const binaryUrl =
          isImageFile(path) && !diff.deleted_file
            ? await client
                .getRawBlob(projectId, to, path)
                .then((blob) => URL.createObjectURL(blob))
                .catch(() => null)
            : null
        return {
          repoPath: path,
          kind,
          before: null,
          after: null,
          binaryUrl,
        } satisfies DiffEntry
      }
      const [before, after] = await Promise.all([
        diff.new_file
          ? Promise.resolve(null)
          : loadText(client, fromProjectId ?? projectId, from, diff.old_path),
        diff.deleted_file
          ? Promise.resolve(null)
          : loadText(client, projectId, to, path),
      ])
      return { repoPath: path, kind, before, after } satisfies DiffEntry
    }),
  )
}

export function HistoryPanel({
  client,
  projectId,
  branch,
  defaultBranch,
  upstreamProjectId,
  scopePath,
  config,
  renderPreview,
}: HistoryPanelProps) {
  const [scope, setScope] = useState<"file" | "all">(scopePath ? "file" : "all")
  const path = scope === "file" && scopePath ? scopePath : config.docsRoot
  const commits = useAsync(
    () => client.listCommits(projectId, branch, path, 40),
    [client, projectId, branch, path],
  )
  const [selection, setSelection] = useState<
    { type: "commit"; commit: GitLabCommit } | { type: "base" } | null
  >(null)

  const loadSelection = useCallback(async () => {
    if (!selection) return null
    if (selection.type === "base") {
      return entriesForCompare(
        client,
        projectId,
        defaultBranch,
        branch,
        config,
        upstreamProjectId,
      )
    }
    const parent = selection.commit.parent_ids[0]
    if (!parent) return []
    return entriesForCompare(
      client,
      projectId,
      parent,
      selection.commit.id,
      config,
    )
  }, [
    selection,
    client,
    projectId,
    branch,
    defaultBranch,
    upstreamProjectId,
    config,
  ])
  const entries = useAsync(selection ? loadSelection : null, [loadSelection])

  const title = useMemo(() => {
    if (!selection) return null
    if (selection.type === "base") return `${branch} vs ${defaultBranch}`
    return `${selection.commit.short_id} ${selection.commit.title}`
  }, [selection, branch, defaultBranch])

  return (
    <section className={panel}>
      <header className={panelHeader}>
        <h2 className={panelTitle}>History</h2>
        <div className="flex flex-wrap items-center gap-2">
          {scopePath && (
            <div className={segmented} role="tablist">
              <button
                type="button"
                role="tab"
                className={segment}
                aria-selected={scope === "file"}
                onClick={() => setScope("file")}
              >
                This page
              </button>
              <button
                type="button"
                role="tab"
                className={segment}
                aria-selected={scope === "all"}
                onClick={() => setScope("all")}
              >
                All docs
              </button>
            </div>
          )}
          {branch !== defaultBranch && (
            <button
              type="button"
              className={button}
              aria-pressed={selection?.type === "base"}
              onClick={() => setSelection({ type: "base" })}
            >
              Compare with {defaultBranch}
            </button>
          )}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] max-md:grid-cols-1 max-md:grid-rows-[minmax(0,200px)_minmax(0,1fr)]">
        <ul className="border-line m-0 list-none overflow-auto border-r p-0 max-md:border-r-0 max-md:border-b">
          {commits.status === "loading" && (
            <li className={`px-3 py-2 ${hint}`}>Loading…</li>
          )}
          {commits.status === "error" && (
            <li className={`px-3 py-2 ${errorText}`}>
              {describeError(commits.error)}
            </li>
          )}
          {commits.data?.map((commit) => (
            <li key={commit.id}>
              <button
                type="button"
                aria-current={
                  selection?.type === "commit" &&
                  selection.commit.id === commit.id
                }
                className="border-line hover:bg-hover aria-[current=true]:bg-hover flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left"
                onClick={() => setSelection({ type: "commit", commit })}
              >
                <span className="text-ink line-clamp-2 text-[13px]">
                  {commit.title}
                </span>
                <span className="text-faint text-[11px]">
                  {commit.short_id} · {commit.author_name} ·{" "}
                  {new Date(commit.committed_date).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
          {commits.data?.length === 0 && (
            <li className={`px-3 py-2 ${hint}`}>No commits yet.</li>
          )}
        </ul>
        <div className="flex min-h-0 flex-col overflow-hidden">
          {!selection && (
            <p className={`p-3 ${hint}`}>Pick a commit to see what changed.</p>
          )}
          {selection && entries.status === "loading" && (
            <p className={`p-3 ${hint}`}>Loading diff…</p>
          )}
          {selection && entries.status === "error" && (
            <p className={`p-3 ${errorText}`}>{describeError(entries.error)}</p>
          )}
          {selection && entries.data && (
            <DiffPanel
              entries={entries.data}
              config={config}
              renderPreview={renderPreview}
              title={title}
              emptyMessage="Nothing under the docs changed in this commit."
              actions={
                selection.type === "commit" ? (
                  <a
                    className={button}
                    href={selection.commit.web_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on GitLab
                  </a>
                ) : null
              }
            />
          )}
        </div>
      </div>
      <p className={`border-line border-t px-3 py-1 ${hint}`}>
        {scope === "file" && scopePath
          ? fileFor(config, scopePath)
          : "All documentation files"}
      </p>
    </section>
  )
}
