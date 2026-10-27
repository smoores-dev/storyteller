import React, { type ReactNode, useEffect, useMemo, useState } from "react"

import {
  type StudioConfig,
  basename,
  dirname,
  fileFor,
  joinPath,
} from "../config"
import type { GitLabProject } from "../gitlab/client"
import {
  type ImageDestination,
  type ImageDestinationKind,
  customDestination,
  imageDestinations,
  slugify,
  suggestImageName,
} from "../images/naming"
import type { ChangesetData } from "../model/changeset"
import { CommitFailure, summarizeActions } from "../model/commitFailure"
import type { ConflictDecision, ConflictFile } from "../model/conflicts"
import type { SidebarDestination } from "../model/sidebars"
import {
  type Workspace,
  isValidBranchName,
  suggestBranchName,
} from "../model/workspace"
import {
  backupFileName,
  downloadBlob,
  downloadText,
  exportChangesZip,
  exportDraft,
  importDraft,
  zipFileName,
} from "../storage/backup"
import type { SaveState } from "../storage/drafts"

import { UnifiedDiff } from "./DiffPanel"
import {
  button,
  buttonPrimary,
  codeChip,
  errorText,
  hint,
  iconButton,
  input,
  label as labelClass,
  warnText,
} from "./classes"
import { describeError, errorDetails } from "./hooks"

export function ErrorPanel({ error }: { error: unknown }) {
  const [copied, setCopied] = useState(false)
  const failure = error instanceof CommitFailure ? error : null
  const message = failure ? failure.message : describeError(error)
  const details = [
    errorDetails(failure ? failure.reason : error),
    failure ? `actions:\n${summarizeActions(failure.actions)}` : null,
  ]
    .filter(Boolean)
    .join("\n")
  return (
    <div className="mt-2 flex flex-col gap-2" role="alert">
      <p className={`m-0 ${errorText}`}>{message}</p>
      {failure && failure.problems.length > 0 && (
        <ul className="border-line m-0 max-h-40 list-none overflow-auto rounded-md border p-0 text-[12px]">
          {failure.problems.map((problem) => (
            <li
              key={`${problem.path}:${problem.problem}`}
              className="border-line border-b px-2 py-1 last:border-b-0"
            >
              <code className={codeChip}>{problem.path}</code>{" "}
              <span className="text-muted">{problem.problem}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="text-[12px]">
        <summary className="text-muted cursor-pointer">Details</summary>
        <pre className="bg-surface border-line mt-1 max-h-48 overflow-auto rounded-md border p-2 whitespace-pre-wrap">
          {details}
        </pre>
        <button
          type="button"
          className={`${button} mt-1`}
          onClick={() => {
            navigator.clipboard
              .writeText(details)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }}
        >
          {copied ? "Copied" : "Copy details"}
        </button>
      </details>
    </div>
  )
}

export function BackupDialog({
  draft,
  state,
  onImport,
  onRetry,
  onClose,
}: {
  draft: ChangesetData | null
  state: SaveState
  onImport: (incoming: ChangesetData) => void
  onRetry: () => Promise<void>
  onClose: () => void
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const picker = React.useRef<HTMLInputElement>(null)
  const count = draft ? Object.keys(draft.changes).length : 0
  const download = async () => {
    if (!draft) return
    setBusy(true)
    try {
      downloadText(backupFileName(draft.branch), await exportDraft(draft))
    } catch (error) {
      setProblem(describeError(error))
    } finally {
      setBusy(false)
    }
  }
  const downloadZip = async () => {
    if (!draft) return
    setBusy(true)
    try {
      downloadBlob(zipFileName(draft.branch), await exportChangesZip(draft))
    } catch (error) {
      setProblem(describeError(error))
    } finally {
      setBusy(false)
    }
  }
  const restore = async (file: File) => {
    if (!draft) return
    setProblem(null)
    setDone(null)
    try {
      const incoming = importDraft(
        await file.text(),
        draft.projectId,
        draft.branch,
      )
      onImport(incoming)
      setDone(
        `Restored ${Object.keys(incoming.changes).length} changed files into this draft.`,
      )
    } catch (error) {
      setProblem(describeError(error))
    }
  }
  return (
    <Modal title="Your draft" onClose={onClose}>
      <p className={hint}>
        Changes live in this browser until you commit them.{" "}
        {count === 0
          ? "There are no changes right now."
          : `${count} changed ${count === 1 ? "file" : "files"} in this draft.`}
      </p>
      <p className={`mt-2 ${hint}`}>
        Want a copy that is safe whatever happens to this browser? The zip holds
        your pages and images as plain files plus a list of what changed, and
        its name carries the date. The backup file is the one to use with
        Restore.
      </p>
      {state.status === "error" && (
        <p className={`mt-2 ${errorText}`}>
          Saving failed: {state.message}{" "}
          {state.quota
            ? "Free up browser storage or download a backup, your edits stay on screen until you leave this page."
            : "Download a backup so nothing is lost."}
        </p>
      )}
      {state.status === "unavailable" && (
        <p className={`mt-2 ${warnText}`}>
          {state.message} Your changes only live in this tab, download a backup
          before you leave.
        </p>
      )}
      {state.status === "saved" && (
        <p className={`mt-2 ${hint}`}>
          Last saved {new Date(state.at).toLocaleTimeString()}.
        </p>
      )}
      {problem && <p className={`mt-2 ${errorText}`}>{problem}</p>}
      {done && <p className={`mt-2 ${hint}`}>{done}</p>}
      <DialogActions>
        {(state.status === "error" || state.status === "unavailable") && (
          <button
            type="button"
            className={button}
            onClick={() => void onRetry()}
          >
            Try saving again
          </button>
        )}
        <button
          type="button"
          className={button}
          onClick={() => picker.current?.click()}
        >
          Restore from backup…
        </button>
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0]
            event.target.value = ""
            if (picked) void restore(picked)
          }}
        />
        <button
          type="button"
          className={button}
          disabled={count === 0 || busy}
          onClick={() => void download()}
        >
          Download backup file
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={count === 0 || busy}
          onClick={() => void downloadZip()}
        >
          Download zip
        </button>
      </DialogActions>
    </Modal>
  )
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className={`border-line bg-raised text-ink flex max-h-full w-full flex-col overflow-hidden rounded-lg border shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-line flex items-center justify-between border-b px-4 py-3">
          <h2 className="m-0 text-[16px] font-semibold">{title}</h2>
          <button
            type="button"
            className={iconButton}
            onClick={onClose}
            aria-label="Close"
          >
            <span aria-hidden="true" className="text-[18px] leading-none">
              ×
            </span>
          </button>
        </div>
        <div className="overflow-auto px-4 py-3">{children}</div>
      </div>
    </div>
  )
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>
}

export interface ImagePlacement {
  file: File
  destination: ImageDestination
  alt: string
}

export function ImagePasteDialog({
  files,
  docFile,
  config,
  existingPaths,
  onConfirm,
  onClose,
}: {
  files: File[]
  docFile: string
  config: StudioConfig
  existingPaths: Set<string>
  onConfirm: (placements: ImagePlacement[]) => void
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const [placements, setPlacements] = useState<ImagePlacement[]>([])
  const file = files[index]!
  const existingNames = useMemo(() => {
    const names = new Set<string>()
    for (const path of existingPaths) names.add(basename(path))
    return names
  }, [existingPaths])
  const [name, setName] = useState(() =>
    suggestImageName(file, docFile, existingNames),
  )
  const [kind, setKind] = useState<ImageDestinationKind>("beside")
  const [customDir, setCustomDir] = useState(dirname(docFile))
  const [alt, setAlt] = useState("")
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  const destinations = imageDestinations(config, docFile, name)
  const destination =
    kind === "custom"
      ? customDestination(config, docFile, name, customDir)
      : destinations.find((candidate) => candidate.kind === kind)!
  const collides = existingPaths.has(destination.repoPath)
  const valid = /^[a-z0-9][a-z0-9._-]*\.[a-z0-9]+$/i.test(name) && !collides

  const next = () => {
    const placement = { file, destination, alt }
    const all = [...placements, placement]
    if (index + 1 < files.length) {
      setPlacements(all)
      setIndex(index + 1)
      setName(suggestImageName(files[index + 1]!, docFile, existingNames))
      setAlt("")
    } else {
      onConfirm(all)
    }
  }

  return (
    <Modal
      title={
        files.length > 1
          ? `Add image ${index + 1} of ${files.length}`
          : "Add image"
      }
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
        <img
          src={previewUrl}
          alt=""
          className="border-line max-h-40 w-full rounded-md border object-contain"
        />
        <div className="flex flex-col gap-3">
          <label className={labelClass}>
            File name
            <input
              className={input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setName((value) => value.replace(/\s+/g, "-"))}
              autoFocus
            />
          </label>
          <label className={labelClass}>
            Alt text
            <input
              className={input}
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              placeholder="What the image shows"
            />
          </label>
          <fieldset className="border-line flex flex-col gap-1.5 rounded-md border p-2">
            <legend className="text-muted px-1 text-[12px]">Where</legend>
            {destinations.map((candidate) => (
              <label
                key={candidate.kind}
                className="flex flex-wrap items-center gap-2 text-[13px]"
              >
                <input
                  type="radio"
                  name="destination"
                  checked={kind === candidate.kind}
                  onChange={() => setKind(candidate.kind)}
                />
                {candidate.kind === "beside"
                  ? "Next to this page"
                  : "static/img"}
                <code className={codeChip}>
                  {candidate.repoPath.slice(config.docsRoot.length + 1)}
                </code>
              </label>
            ))}
            <label className="flex flex-wrap items-center gap-2 text-[13px]">
              <input
                type="radio"
                name="destination"
                checked={kind === "custom"}
                onChange={() => setKind("custom")}
              />
              Folder
              <input
                className={`${input} w-auto flex-1`}
                value={customDir}
                onChange={(event) => {
                  setCustomDir(event.target.value)
                  setKind("custom")
                }}
                placeholder="docs/managing"
              />
            </label>
          </fieldset>
          <p className={hint}>
            Inserted as{" "}
            <code
              className={codeChip}
            >{`![${alt}](${destination.markdownUrl})`}</code>
            {collides && (
              <span className={warnText}>
                {" "}
                A file with this name already exists there.
              </span>
            )}
          </p>
        </div>
      </div>
      <DialogActions>
        <button type="button" className={button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={!valid}
          onClick={next}
        >
          {index + 1 < files.length ? "Next" : "Insert"}
        </button>
      </DialogActions>
    </Modal>
  )
}

export function CommitDialog({
  branch,
  targetLabel,
  formattedCount,
  changedFiles,
  onConfirm,
  onClose,
}: {
  branch: string
  targetLabel: string
  formattedCount: number
  changedFiles: string[]
  onConfirm: (message: string) => Promise<void>
  onClose: () => void
}) {
  const [message, setMessage] = useState(() =>
    changedFiles.length === 1
      ? `docs: update ${basename(changedFiles[0]!)}`
      : `docs: update ${changedFiles.length} files`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm(message.trim())
    } catch (caught) {
      setError(caught)
      setBusy(false)
    }
  }
  return (
    <Modal title="Commit changes" onClose={onClose}>
      <p className={hint}>
        Commits to <code className={codeChip}>{branch}</code> in {targetLabel}.{" "}
        {formattedCount > 0
          ? `Prettier reformatted ${formattedCount} ${formattedCount === 1 ? "file" : "files"}, the editor and the Changes panel show the result.`
          : "All files are already formatted."}
      </p>
      <ul className="border-line my-3 max-h-40 list-none overflow-auto rounded-md border p-0 font-mono text-[12px]">
        {changedFiles.map((file) => (
          <li
            key={file}
            className="border-line border-b px-2 py-1 last:border-b-0"
          >
            {file}
          </li>
        ))}
      </ul>
      <label className={labelClass}>
        Commit message
        <textarea
          className={`${input} min-h-20 resize-y`}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          autoFocus
        />
      </label>
      {error !== null && <ErrorPanel error={error} />}
      <DialogActions>
        <button
          type="button"
          className={button}
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={!message.trim() || busy}
          onClick={submit}
        >
          {busy ? "Committing…" : "Commit"}
        </button>
      </DialogActions>
    </Modal>
  )
}

export function NewFileDialog({
  directory: initialDirectory,
  directories,
  config,
  existingPaths,
  onConfirm,
  onClose,
}: {
  directory: string
  directories?: string[]
  config: StudioConfig
  existingPaths: Set<string>
  onConfirm: (file: string, title: string) => void
  onClose: () => void
}) {
  const [directory, setDirectory] = useState(initialDirectory)
  const [title, setTitle] = useState("")
  const [name, setName] = useState("")
  const [touched, setTouched] = useState(false)
  const fileName = (touched ? name : slugify(title)) || ""
  const file = joinPath(directory, `${fileName}.md`)
  const directoryOptions = directories
    ? Array.from(new Set([...directories, initialDirectory])).sort()
    : null
  const exists = existingPaths.has(joinPath(config.docsRoot, file))
  const valid =
    fileName.length > 0 && /^[a-z0-9][a-z0-9._-]*$/.test(fileName) && !exists
  const isContributing = directory.split("/")[0] === "contributing"
  return (
    <Modal title="New page" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className={labelClass}>
          Title
          <input
            className={input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
        </label>
        {directoryOptions && (
          <label className={labelClass}>
            Folder
            <select
              className={input}
              value={directory}
              onChange={(event) => setDirectory(event.target.value)}
            >
              {directoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={labelClass}>
          File name
          <input
            className={input}
            value={fileName}
            onChange={(event) => {
              setTouched(true)
              setName(event.target.value)
            }}
          />
        </label>
        <p className={hint}>
          <code className={codeChip}>{file}</code>
          {exists && <span className={warnText}> already exists</span>}
        </p>
        {isContributing && (
          <p className={warnText}>
            Pages under contributing/ also need an entry in
            sidebarsContributing.js to appear in the sidebar.
          </p>
        )}
      </div>
      <DialogActions>
        <button type="button" className={button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={!valid}
          onClick={() => onConfirm(file, title)}
        >
          Create
        </button>
      </DialogActions>
    </Modal>
  )
}

export function StartEditingDialog({
  workspace,
  signedIn,
  canSignIn,
  branches,
  defaultBranch,
  seedName,
  onSignIn,
  onCreateFork,
  onSelectFork,
  onStart,
  onClose,
}: {
  workspace: Workspace | null
  signedIn: boolean
  canSignIn: boolean
  branches: string[]
  defaultBranch: string
  seedName: string
  onSignIn: () => void
  onCreateFork: () => Promise<void>
  onSelectFork: (fork: GitLabProject) => void
  onStart: (branch: string, isNew: boolean) => Promise<void>
  onClose: () => void
}) {
  const [mode, setMode] = useState<"new" | "existing">("new")
  const [newBranch, setNewBranch] = useState(() => suggestBranchName(seedName))
  const others = branches.filter((name) => name !== defaultBranch)
  const [existing, setExisting] = useState(others[0] ?? "")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await task()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(null)
    }
  }
  const target = workspace
    ? workspace.canPushUpstream
      ? workspace.upstream
      : workspace.fork
    : null
  const branch = mode === "new" ? newBranch : existing
  const valid =
    mode === "new"
      ? isValidBranchName(newBranch, defaultBranch) &&
        !branches.includes(newBranch)
      : existing !== ""

  let body: ReactNode
  if (!signedIn) {
    body = (
      <>
        <p>
          Sign in with GitLab to edit the documentation. Your changes are
          committed to a branch and reviewed through a merge request, nothing is
          published directly.
        </p>
        <DialogActions>
          <button type="button" className={button} onClick={onClose}>
            Keep reading
          </button>
          <button
            type="button"
            className={buttonPrimary}
            disabled={!canSignIn}
            onClick={onSignIn}
          >
            Sign in with GitLab
          </button>
        </DialogActions>
        {!canSignIn && (
          <p className={`mt-2 ${hint}`}>
            Sign-in is not configured for this site. Set STUDIO_GITLAB_APP_ID
            when building the docs.
          </p>
        )}
      </>
    )
  } else if (!workspace) {
    body = <p className={hint}>Checking your access…</p>
  } else if (!target) {
    body = (
      <>
        <p>
          You do not have write access to{" "}
          <code className={codeChip}>
            {workspace.upstream.path_with_namespace}
          </code>
          . Create a fork under your account to make changes. Your merge request
          will be opened from the fork.
        </p>
        {error && <p className={errorText}>{error}</p>}
        <DialogActions>
          <button type="button" className={button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonPrimary}
            disabled={busy !== null}
            onClick={() => run("fork", onCreateFork)}
          >
            {busy === "fork" ? "Creating fork…" : "Create fork"}
          </button>
        </DialogActions>
      </>
    )
  } else {
    body = (
      <>
        <p className={hint}>
          Changes are committed to{" "}
          <code className={codeChip}>{target.path_with_namespace}</code>
          {target.id !== workspace.upstream.id && " (your fork)"}. Editing on{" "}
          <code className={codeChip}>{defaultBranch}</code> is not allowed, so
          pick a branch to work on.
        </p>
        {workspace.forks.length > 1 && (
          <label className={`mt-3 ${labelClass}`}>
            Fork
            <select
              className={input}
              value={target.id}
              onChange={(event) => {
                const fork = workspace.forks.find(
                  (candidate) => candidate.id === Number(event.target.value),
                )
                if (fork) onSelectFork(fork)
              }}
            >
              {workspace.forks.map((fork) => (
                <option key={fork.id} value={fork.id}>
                  {fork.path_with_namespace}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="border-line mt-3 flex flex-col gap-2 rounded-md border p-2">
          <legend className="text-muted px-1 text-[12px]">Branch</legend>
          <label className="flex flex-wrap items-center gap-2 text-[13px]">
            <input
              type="radio"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />
            New branch
            <input
              className={`${input} w-auto flex-1`}
              value={newBranch}
              onChange={(event) => setNewBranch(event.target.value)}
              onFocus={() => setMode("new")}
            />
          </label>
          {others.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-[13px]">
              <input
                type="radio"
                checked={mode === "existing"}
                onChange={() => setMode("existing")}
              />
              Existing branch
              <select
                className={`${input} w-auto flex-1`}
                value={existing}
                onChange={(event) => setExisting(event.target.value)}
                onFocus={() => setMode("existing")}
              >
                {others.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        {mode === "new" && branches.includes(newBranch) && (
          <p className={`mt-2 ${warnText}`}>That branch already exists.</p>
        )}
        {error && <p className={`mt-2 ${errorText}`}>{error}</p>}
        <DialogActions>
          <button type="button" className={button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonPrimary}
            disabled={!valid || busy !== null}
            onClick={() => run("start", () => onStart(branch, mode === "new"))}
          >
            {busy === "start"
              ? "Preparing…"
              : mode === "new"
                ? "Create branch and edit"
                : "Edit on this branch"}
          </button>
        </DialogActions>
      </>
    )
  }
  return (
    <Modal title="Start editing" onClose={onClose}>
      {body}
    </Modal>
  )
}

export function MoveDialog({
  file,
  directories,
  config,
  existingPaths,
  onConfirm,
  onClose,
}: {
  file: string
  directories: string[]
  config: StudioConfig
  existingPaths: Set<string>
  onConfirm: (target: string) => void
  onClose: () => void
}) {
  const [directory, setDirectory] = useState(dirname(file))
  const [name, setName] = useState(basename(file))
  const target = joinPath(directory, name)
  const exists =
    target !== file && existingPaths.has(joinPath(config.docsRoot, target))
  const valid =
    name.length > 0 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) &&
    directory.length > 0 &&
    target !== file &&
    !exists
  const options = Array.from(new Set([...directories, directory])).sort()
  return (
    <Modal title="Move or rename" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className={hint}>
          Moving <code className={codeChip}>{file}</code>
        </p>
        <label className={labelClass}>
          Folder
          <input
            className={input}
            list="studio-move-directories"
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
          />
          <datalist id="studio-move-directories">
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
        <label className={labelClass}>
          File name
          <input
            className={input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <p className={hint}>
          <code className={codeChip}>{target}</code>
          {exists && <span className={warnText}> already exists</span>}
        </p>
        <p className={hint}>
          Relative links inside the moved page are rewritten and its sidebar
          entry follows it. Links from other pages to this one are not, the
          editor flags them as broken when you open those pages.
        </p>
      </div>
      <DialogActions>
        <button type="button" className={button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={!valid}
          onClick={() => onConfirm(target)}
        >
          Move
        </button>
      </DialogActions>
    </Modal>
  )
}

export function SidebarPlaceDialog({
  title,
  page,
  confirmLabel,
  destinations,
  onConfirm,
  onClose,
}: {
  title: string
  page: string
  confirmLabel: string
  destinations: SidebarDestination[]
  onConfirm: (destination: SidebarDestination) => void
  onClose: () => void
}) {
  const [chosen, setChosen] = useState(0)
  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className={hint}>
          Where should <code className={codeChip}>{page}</code> go? It is added
          at the end of the one you pick. Drag it afterwards to fine tune the
          order.
        </p>
        <fieldset className="border-line m-0 flex max-h-72 flex-col gap-1 overflow-y-auto rounded border p-2">
          {destinations.map((destination, index) => (
            <label
              key={destination.path.join(".")}
              className="flex items-center gap-2 text-[13px]"
              style={{ paddingLeft: destination.depth * 14 }}
            >
              <input
                type="radio"
                name="sidebar-destination"
                checked={chosen === index}
                onChange={() => setChosen(index)}
              />
              {destination.label}
            </label>
          ))}
        </fieldset>
      </div>
      <DialogActions>
        <button type="button" className={button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={destinations[chosen] === undefined}
          onClick={() => onConfirm(destinations[chosen]!)}
        >
          {confirmLabel}
        </button>
      </DialogActions>
    </Modal>
  )
}

export function ConflictDialog({
  files,
  branch,
  config,
  onResolve,
  onClose,
}: {
  files: ConflictFile[]
  branch: string
  config: StudioConfig
  onResolve: (decisions: Record<string, ConflictDecision>) => Promise<void>
  onClose: () => void
}) {
  const [decisions, setDecisions] = useState<Record<string, ConflictDecision>>(
    () => Object.fromEntries(files.map((file) => [file.repoPath, "mine"])),
  )
  const [active, setActive] = useState(files[0]?.repoPath ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const current = files.find((file) => file.repoPath === active) ?? files[0]
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await onResolve(decisions)
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Someone else changed these files" onClose={onClose} wide>
      <p className={hint}>
        <code className={codeChip}>{branch}</code> moved on since you loaded
        these files. Git does not merge for you here: pick, per file, whether
        your version replaces theirs or you drop your change and take theirs.
        Keeping yours throws their edit away, so look at the diff first. If you
        want to combine both, cancel, copy what you need from the diff into the
        editor, and commit again.
      </p>
      <div className="border-line mt-3 grid min-h-0 grid-cols-[240px_minmax(0,1fr)] overflow-hidden rounded-md border max-md:grid-cols-1">
        <ul className="border-line m-0 max-h-80 list-none overflow-auto border-r p-0">
          {files.map((file) => (
            <li
              key={file.repoPath}
              className="border-line flex flex-col gap-1 border-b px-2 py-1.5 last:border-b-0"
            >
              <button
                type="button"
                className={`truncate text-left font-mono text-[12px] ${file === current ? "text-primary" : "text-ink"}`}
                onClick={() => setActive(file.repoPath)}
              >
                {fileFor(config, file.repoPath) ?? file.repoPath}
              </button>
              <div className="flex gap-3 text-[12px]">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={`decision:${file.repoPath}`}
                    checked={decisions[file.repoPath] === "mine"}
                    onChange={() =>
                      setDecisions((d) => ({ ...d, [file.repoPath]: "mine" }))
                    }
                  />
                  Keep mine
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={`decision:${file.repoPath}`}
                    checked={decisions[file.repoPath] === "theirs"}
                    onChange={() =>
                      setDecisions((d) => ({ ...d, [file.repoPath]: "theirs" }))
                    }
                  />
                  Take theirs
                </label>
              </div>
            </li>
          ))}
        </ul>
        <div className="max-h-80 overflow-auto">
          {current && current.textual ? (
            <>
              <p className={`px-3 pt-2 ${hint}`}>
                Their version on the left, yours on the right.
                {current.theirs === null && " They deleted the file."}
                {current.mine === null && " You are deleting the file."}
              </p>
              <UnifiedDiff
                before={current.theirs ?? ""}
                after={current.mine ?? ""}
              />
            </>
          ) : (
            <p className={`p-3 ${hint}`}>
              Binary file, no diff to show.
              {current?.theirs === null && " They deleted it."}
            </p>
          )}
        </div>
      </div>
      {error !== null && <ErrorPanel error={error} />}
      <DialogActions>
        <button type="button" className={button} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonPrimary}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "Committing…" : "Resolve and commit"}
        </button>
      </DialogActions>
    </Modal>
  )
}
