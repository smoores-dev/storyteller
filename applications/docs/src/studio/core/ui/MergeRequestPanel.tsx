import React, { useState } from "react"

import { type StudioConfig, fileFor, isMarkdownFile } from "../config"
import type {
  GitLabClient,
  GitLabDiscussion,
  GitLabMergeRequestDetail,
  GitLabNote,
  GitLabProject,
  PipelineStatus,
} from "../gitlab/client"

import { type DiffEntry, DiffPanel, type RenderPreview } from "./DiffPanel"
import {
  button,
  buttonPrimary,
  codeChip,
  errorText,
  ghostButton,
  hint,
  input,
  label as labelClass,
  panel,
  panelHeader,
  panelTitle,
  segment,
  segmented,
} from "./classes"
import { type AsyncState, describeError, useAsync } from "./hooks"

const PIPELINE_LABEL: Record<PipelineStatus, string> = {
  created: "Pipeline queued",
  waiting_for_resource: "Pipeline waiting",
  preparing: "Pipeline preparing",
  pending: "Pipeline pending",
  running: "Pipeline running",
  success: "Pipeline passed",
  failed: "Pipeline failed",
  canceled: "Pipeline canceled",
  skipped: "Pipeline skipped",
  manual: "Pipeline waiting for manual action",
  scheduled: "Pipeline scheduled",
}

function pipelineTone(status: PipelineStatus) {
  if (status === "success") return "bg-success"
  if (status === "failed") return "bg-danger"
  if (status === "running" || status === "pending" || status === "created")
    return "bg-warn"
  return "bg-faint"
}

export function PipelineBadge({
  mr,
  compact = false,
}: {
  mr: GitLabMergeRequestDetail
  compact?: boolean
}) {
  const pipeline = mr.head_pipeline
  const label = pipeline ? PIPELINE_LABEL[pipeline.status] : "No pipeline"
  return (
    <a
      href={pipeline?.web_url ?? mr.web_url}
      target="_blank"
      rel="noreferrer"
      className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-[12px]"
      title={label}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2.5 w-2.5 rounded-full ${pipeline ? pipelineTone(pipeline.status) : "bg-faint"}`}
      />
      {compact ? null : label}
      <span className="sr-only">{label}</span>
    </a>
  )
}

export type MergeRequestTab = "overview" | "changes" | "comments"

export function openDiscussionCount(discussions: GitLabDiscussion[]) {
  return discussions.filter((discussion) => {
    const notes = discussion.notes.filter((note) => !note.system)
    return (
      notes.length > 0 &&
      notes.some((note) => note.resolvable && !note.resolved)
    )
  }).length
}

interface MergeRequestPanelProps {
  client: GitLabClient
  upstream: GitLabProject
  source: GitLabProject
  branch: string
  defaultBranch: string
  shareUrl: string
  signedIn: boolean
  canWrite: boolean
  branchExists: boolean
  mergeRequest: AsyncState<GitLabMergeRequestDetail | null>
  discussions: AsyncState<GitLabDiscussion[]>
  config: StudioConfig
  renderPreview: RenderPreview
  loadSourceFile: (repoPath: string) => Promise<string | null>
  currentFile: string | null
  currentLine: () => number | null
  onOpenFile: (file: string, line: number | null) => void
  tab: MergeRequestTab
  onTabChange: (tab: MergeRequestTab) => void
}

export function MergeRequestPanel(props: MergeRequestPanelProps) {
  const { mergeRequest, discussions, tab, onTabChange } = props
  const mr = mergeRequest.data
  const openCount = discussions.data ? openDiscussionCount(discussions.data) : 0
  return (
    <section className={panel}>
      <header className={panelHeader}>
        <h2 className={panelTitle}>
          {mr ? (
            <a href={mr.web_url} target="_blank" rel="noreferrer">
              !{mr.iid} {mr.title}
            </a>
          ) : (
            "Merge request"
          )}
        </h2>
        {mr && (
          <div className={segmented} role="tablist">
            {(
              [
                ["overview", "Overview"],
                ["changes", "Changes"],
                [
                  "comments",
                  openCount > 0 ? `Comments (${openCount})` : "Comments",
                ],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={segment}
                aria-selected={tab === id}
                onClick={() => onTabChange(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>
      {mr && tab === "changes" ? (
        <ChangesTab {...props} mr={mr} />
      ) : mr && tab === "comments" ? (
        <CommentsTab {...props} mr={mr} />
      ) : (
        <OverviewTab {...props} />
      )}
    </section>
  )
}

function OverviewTab({
  client,
  upstream,
  source,
  branch,
  defaultBranch,
  shareUrl,
  signedIn,
  canWrite,
  branchExists,
  mergeRequest,
}: MergeRequestPanelProps) {
  const onDefault = branch === defaultBranch
  const [title, setTitle] = useState(
    `Draft: docs: ${branch.replace(/^docs\//, "").replace(/-/g, " ")}`,
  )
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const compareUrl =
    source.id === upstream.id
      ? `${upstream.web_url}/-/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branch)}`
      : `${upstream.web_url}/-/compare/${encodeURIComponent(defaultBranch)}...${encodeURIComponent(branch)}?from_project_id=${upstream.id}&to_project_id=${source.id}`
  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      await client.createMergeRequest(source.id, {
        source_branch: branch,
        target_branch: defaultBranch,
        target_project_id: upstream.id,
        title,
        description: `Documentation changes made with the docs studio.\n\nPreview: ${shareUrl}`,
        remove_source_branch: true,
      })
      mergeRequest.reload()
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setCreating(false)
    }
  }
  const mr = mergeRequest.data
  return (
    <div className="flex max-w-2xl flex-col gap-2 overflow-auto p-4">
      {onDefault ? (
        <p className={hint}>
          You are viewing <code className={codeChip}>{defaultBranch}</code>.
          Start editing on a branch first, then you can open a merge request
          from here.
        </p>
      ) : mergeRequest.status === "loading" ? (
        <p className={hint}>Checking for an open merge request…</p>
      ) : mergeRequest.status === "error" ? (
        <p className={errorText}>{describeError(mergeRequest.error)}</p>
      ) : mr ? (
        <div className="border-line flex flex-col gap-2 rounded-md border p-3">
          <a
            href={mr.web_url}
            target="_blank"
            rel="noreferrer"
            className="text-[14px] font-medium"
          >
            !{mr.iid} {mr.title}
          </a>
          <div className="flex flex-wrap items-center gap-3">
            <PipelineBadge mr={mr} />
            {mr.has_conflicts && (
              <span className="text-danger text-[12px]">
                Has conflicts with {defaultBranch}
              </span>
            )}
            {mr.changes_count && (
              <span className="text-muted text-[12px]">
                {mr.changes_count} changed files
              </span>
            )}
            <button
              type="button"
              className={button}
              onClick={() => mergeRequest.reload()}
            >
              Refresh
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className={hint}>
            No open merge request for <code className={codeChip}>{branch}</code>{" "}
            yet.{" "}
            {branchExists && (
              <a href={compareUrl} target="_blank" rel="noreferrer">
                Compare on GitLab
              </a>
            )}
          </p>
          {!branchExists ? (
            <p className={hint}>
              Commit something first, the branch is created with your first
              commit.
            </p>
          ) : signedIn && canWrite ? (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>
                Title
                <input
                  className={input}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              {error && <p className={errorText}>{error}</p>}
              <div>
                <button
                  type="button"
                  className={buttonPrimary}
                  disabled={creating || !title.trim()}
                  onClick={create}
                >
                  {creating ? "Creating…" : "Create merge request"}
                </button>
              </div>
            </div>
          ) : (
            <p className={hint}>Sign in to create a merge request.</p>
          )}
        </>
      )}
      <h3 className="mt-4 mb-0 text-[14px] font-semibold">Preview link</h3>
      <p className={hint}>
        Anyone can open this read-only view of{" "}
        <code className={codeChip}>{branch}</code>.
      </p>
      <div className="flex gap-2">
        <input
          className={`${input} font-mono text-[12px]`}
          readOnly
          value={shareUrl}
          onFocus={(event) => event.target.select()}
        />
        <button
          type="button"
          className={button}
          onClick={() => {
            navigator.clipboard
              .writeText(shareUrl)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  )
}

const MAX_DIFF_FILES = 40

function ChangesTab({
  client,
  upstream,
  defaultBranch,
  config,
  renderPreview,
  loadSourceFile,
  mr,
}: MergeRequestPanelProps & { mr: GitLabMergeRequestDetail }) {
  const entries = useAsync(async () => {
    const diffs = await client.listMergeRequestDiffs(upstream.id, mr.iid)
    const relevant = diffs.filter(
      (diff) =>
        fileFor(config, diff.new_path) !== null ||
        fileFor(config, diff.old_path) !== null,
    )
    const shown = relevant.slice(0, MAX_DIFF_FILES)
    const result: DiffEntry[] = await Promise.all(
      shown.map(async (diff): Promise<DiffEntry> => {
        const kind = diff.new_file
          ? "added"
          : diff.deleted_file
            ? "deleted"
            : diff.renamed_file
              ? "renamed"
              : "modified"
        const textual = isMarkdownFile(diff.new_path)
        const before =
          textual && !diff.new_file
            ? await client
                .getFile(upstream.id, defaultBranch, diff.old_path)
                .then((file) => file.content)
                .catch(() => null)
            : null
        const after =
          textual && !diff.deleted_file
            ? await loadSourceFile(diff.new_path)
            : null
        return {
          repoPath: diff.new_path,
          kind,
          renamedFrom: diff.renamed_file ? diff.old_path : undefined,
          before,
          after,
        }
      }),
    )
    return { entries: result, hidden: relevant.length - shown.length }
  }, [client, upstream.id, mr.iid, defaultBranch])
  if (entries.status === "loading" || entries.status === "idle") {
    return <p className={`p-3 ${hint}`}>Loading the merge request diff…</p>
  }
  if (entries.status === "error") {
    return <p className={`p-3 ${errorText}`}>{describeError(entries.error)}</p>
  }
  return (
    <DiffPanel
      entries={entries.data?.entries ?? []}
      config={config}
      renderPreview={renderPreview}
      title={`Changes against ${defaultBranch}`}
      emptyMessage="The merge request has no changes under the docs folder."
      actions={
        entries.data && entries.data.hidden > 0 ? (
          <span className={hint}>
            {entries.data.hidden} more files are only shown on GitLab.
          </span>
        ) : (
          <button
            type="button"
            className={button}
            onClick={() => entries.reload()}
          >
            Refresh
          </button>
        )
      }
    />
  )
}

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return value
  }
}

function CommentsTab({
  client,
  upstream,
  signedIn,
  config,
  discussions,
  currentFile,
  currentLine,
  onOpenFile,
  mr,
}: MergeRequestPanelProps & { mr: GitLabMergeRequestDetail }) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const line = currentLine()
  const post = async (anchored: boolean) => {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    try {
      const refs = mr.diff_refs
      if (anchored && currentFile && refs && line !== null) {
        const repoPath = `${config.docsRoot}/${currentFile}`
        try {
          await client.createDiscussion(upstream.id, mr.iid, text, {
            position_type: "text",
            new_path: repoPath,
            old_path: repoPath,
            new_line: line,
            old_line: null,
            base_sha: refs.base_sha,
            head_sha: refs.head_sha,
            start_sha: refs.start_sha,
          })
        } catch {
          await client.createDiscussion(
            upstream.id,
            mr.iid,
            `\`${currentFile}\` line ${line}:\n\n${text}`,
          )
        }
      } else {
        await client.createDiscussion(upstream.id, mr.iid, text)
      }
      setBody("")
      discussions.reload()
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }
  const list = (discussions.data ?? [])
    .map((discussion) => ({
      discussion,
      notes: discussion.notes.filter((note) => !note.system),
    }))
    .filter(({ notes }) => notes.length > 0)
  const visible = list.filter(
    ({ notes }) =>
      showResolved || !notes.every((note) => !note.resolvable || note.resolved),
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="border-line flex flex-col gap-2 border-b p-3">
        {signedIn ? (
          <>
            <textarea
              className={`${input} min-h-16 resize-y`}
              placeholder="Write a comment for the reviewers…"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={2}
            />
            {error && <p className={errorText}>{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonPrimary}
                disabled={busy || !body.trim()}
                onClick={() => void post(false)}
              >
                Comment
              </button>
              {currentFile && line !== null && mr.diff_refs && (
                <button
                  type="button"
                  className={button}
                  disabled={busy || !body.trim()}
                  onClick={() => void post(true)}
                >
                  Comment on line {line} of {currentFile.split("/").pop()}
                </button>
              )}
              <label className="text-muted ml-auto flex items-center gap-1 text-[12px]">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(event) => setShowResolved(event.target.checked)}
                />
                Show resolved
              </label>
            </div>
          </>
        ) : (
          <p className={hint}>Sign in to comment.</p>
        )}
      </div>
      {discussions.status === "loading" && (
        <p className={`p-3 ${hint}`}>Loading comments…</p>
      )}
      {discussions.status === "error" && (
        <p className={`p-3 ${errorText}`}>{describeError(discussions.error)}</p>
      )}
      {discussions.status === "ready" && visible.length === 0 && (
        <p className={`p-3 ${hint}`}>
          {list.length === 0
            ? "No comments yet."
            : "All comments are resolved."}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-3 p-3">
        {visible.map(({ discussion, notes }) => (
          <DiscussionCard
            key={discussion.id}
            client={client}
            projectId={upstream.id}
            iid={mr.iid}
            discussion={discussion}
            notes={notes}
            config={config}
            signedIn={signedIn}
            onOpenFile={onOpenFile}
            onChanged={() => discussions.reload()}
          />
        ))}
      </ul>
    </div>
  )
}

function DiscussionCard({
  client,
  projectId,
  iid,
  discussion,
  notes,
  config,
  signedIn,
  onOpenFile,
  onChanged,
}: {
  client: GitLabClient
  projectId: number
  iid: number
  discussion: GitLabDiscussion
  notes: GitLabNote[]
  config: StudioConfig
  signedIn: boolean
  onOpenFile: (file: string, line: number | null) => void
  onChanged: () => void
}) {
  const first = notes[0]!
  const position = first.position
  const file = position?.new_path ? fileFor(config, position.new_path) : null
  const resolvable = notes.some((note) => note.resolvable)
  const resolved =
    resolvable && notes.every((note) => !note.resolvable || note.resolved)
  const [reply, setReply] = useState("")
  const [replying, setReplying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
      setReply("")
      setReplying(false)
      onChanged()
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li
      className={`border-line flex flex-col gap-2 rounded-md border p-3 ${resolved ? "opacity-70" : ""}`}
    >
      {file && (
        <button
          type="button"
          className="text-primary self-start font-mono text-[12px] hover:underline"
          onClick={() => onOpenFile(file, position?.new_line ?? null)}
        >
          {file}
          {position?.new_line ? `:${position.new_line}` : ""}
        </button>
      )}
      {notes.map((note) => (
        <div key={note.id} className="flex flex-col gap-1">
          <div className="text-muted flex items-center gap-2 text-[12px]">
            {note.author.avatar_url && (
              <img
                src={note.author.avatar_url}
                alt=""
                className="h-5 w-5 rounded-full"
              />
            )}
            <span className="text-ink font-medium">{note.author.name}</span>
            <span>{formatTime(note.created_at)}</span>
          </div>
          <p className="m-0 text-[13px] break-words whitespace-pre-wrap">
            {note.body}
          </p>
        </div>
      ))}
      {error && <p className={errorText}>{error}</p>}
      {signedIn && (
        <div className="flex flex-wrap items-center gap-2">
          {replying ? (
            <>
              <textarea
                className={`${input} min-h-14 flex-1 resize-y`}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                autoFocus
              />
              <button
                type="button"
                className={buttonPrimary}
                disabled={busy || !reply.trim()}
                onClick={() =>
                  void run(() =>
                    client.replyToDiscussion(
                      projectId,
                      iid,
                      discussion.id,
                      reply.trim(),
                    ),
                  )
                }
              >
                Reply
              </button>
              <button
                type="button"
                className={ghostButton}
                onClick={() => setReplying(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className={ghostButton}
              onClick={() => setReplying(true)}
            >
              Reply
            </button>
          )}
          {resolvable && (
            <button
              type="button"
              className={ghostButton}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  client.resolveDiscussion(
                    projectId,
                    iid,
                    discussion.id,
                    !resolved,
                  ),
                )
              }
            >
              {resolved ? "Unresolve" : "Resolve"}
            </button>
          )}
        </div>
      )}
    </li>
  )
}
