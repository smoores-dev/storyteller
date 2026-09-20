import React, {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  type StudioConfig,
  basename,
  buildLocationSearch,
  dirname,
  fileFor,
  isImageFile,
  isMarkdownFile,
  joinPath,
  markdownFormat,
  rebaseRelativeLinks,
  repoPathFor,
} from "../config"
import { blameRanges } from "../editor/blame"
import { replaceDocument } from "../editor/commands"
import type { LinkContext } from "../editor/linkCompletion"
import type { CompileProblem, LintContext, LintNote } from "../editor/lint"
import type { SnippetAction } from "../editor/snippets"
import { formatMarkdown } from "../format"
import { GitLabError, type GitLabProject } from "../gitlab/client"
import { fileToBase64 } from "../images/naming"
import {
  type ChangesetData,
  MISSING_BASE,
  changedPaths,
  emptyChangeset,
  isDirty,
  movedFromPaths,
  shapeOf,
  toCommitActions,
  withBinaryChange,
  withDeletion,
  withMove,
  withTextChange,
  withoutChange,
} from "../model/changeset"
import {
  type ConflictDecision,
  type ConflictFile,
  findConflicts,
} from "../model/conflicts"
import { type SidebarOutline, versionForFile } from "../model/outline"
import { type SidebarsJson, serializeSidebars } from "../model/sidebars"
import {
  branchProject,
  createWorkBranch,
  ensureFork,
  readProject,
  rememberFork,
  writeProject,
} from "../model/workspace"

import { type DiffEntry, DiffPanel, type RenderPreview } from "./DiffPanel"
import { Editor, type EditorHandle } from "./Editor"
import { FileTree, type TreeView } from "./FileTree"
import { HistoryPanel } from "./HistoryPanel"
import { LinkDialog } from "./LinkDialog"
import {
  MergeRequestPanel,
  type MergeRequestTab,
  PipelineBadge,
  openDiscussionCount,
} from "./MergeRequestPanel"
import { Preview, type StudioAdapter } from "./Preview"
import { Toolbar } from "./Toolbar"
import {
  AssetProvider,
  invalidateRemoteAssets,
  useAssetResolver,
  useResolvedAsset,
} from "./assets"
import {
  button,
  buttonPrimary,
  errorText,
  ghostButton,
  hint,
  input,
  paneHeader,
} from "./classes"
import {
  CommitDialog,
  ConflictDialog,
  ImagePasteDialog,
  MoveDialog,
  NewFileDialog,
  StartEditingDialog,
} from "./dialogs"
import {
  describeError,
  fetchRemoteFile,
  invalidateRemoteFiles,
  useAsync,
  useAuthSession,
  useDraft,
  useGitLabClient,
  useMergeRequest,
  useRemoteFile,
  useStudioLocation,
  useTree,
  useWorkspace,
} from "./hooks"
import { LastChanged, invalidateLastChanges, useLastChange } from "./lastChange"
import { useSidebarModels } from "./sidebarModels"

type Panel = "none" | "diff" | "history" | "mr"

export function Studio({
  config,
  adapter,
  outline,
}: {
  config: StudioConfig
  adapter: StudioAdapter
  outline: SidebarOutline
}) {
  const [location, setLocation] = useStudioLocation(config)
  const { session, signedIn } = useAuthSession(config)
  const client = useGitLabClient(session, config)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has("code")) return
    session
      .completeSignIn(url)
      .then((returnTo) => {
        if (returnTo) window.history.replaceState(null, "", returnTo)
        else {
          url.searchParams.delete("code")
          url.searchParams.delete("state")
          window.history.replaceState(null, "", url.toString())
        }
        window.dispatchEvent(new PopStateEvent("popstate"))
      })
      .catch((error: unknown) => setAuthError(describeError(error)))
  }, [session])

  const workspace = useWorkspace(client, config, location, signedIn)
  const ws = workspace.data
  const writeTarget = ws ? writeProject(ws) : null
  const reading = ws ? readProject(ws, location, config) : null
  const branchSource = ws ? branchProject(ws) : null
  const branches = useAsync(
    branchSource === null ? null : () => client.listBranches(branchSource.id),
    [client, branchSource?.id],
  )
  const onDefaultBranch = location.branch === config.defaultBranch
  const branchExists = onDefaultBranch
    ? true
    : (branches.data?.some((branch) => branch.name === location.branch) ??
      false)
  const pendingBranch =
    ws !== null &&
    reading !== null &&
    reading.id !== ws.upstream.id &&
    branches.status === "ready" &&
    !branchExists
  const effectiveProjectId = pendingBranch
    ? ws.upstream.id
    : (reading?.id ?? null)
  const effectiveRef = pendingBranch ? config.defaultBranch : location.branch

  const tree = useTree(client, effectiveProjectId, effectiveRef, config)
  const [draft, updateDraft] = useDraft(reading?.id ?? null, location.branch)

  const canEdit =
    signedIn &&
    ws !== null &&
    writeTarget !== null &&
    reading !== null &&
    reading.id === writeTarget.id &&
    !onDefaultBranch
  const editing = location.mode === "edit" && canEdit
  const needsStart =
    location.mode === "edit" &&
    !editing &&
    (!signedIn || workspace.status === "ready" || workspace.status === "error")
  const [startRequested, setStartRequested] = useState(false)
  const showStart = startRequested || needsStart

  const currentFile = location.file
  const currentRepoPath = currentFile ? repoPathFor(config, currentFile) : null
  const currentIsMarkdown = currentFile ? isMarkdownFile(currentFile) : false
  const currentFormat = currentFile ? markdownFormat(currentFile) : "md"
  const remote = useRemoteFile(
    client,
    effectiveProjectId,
    effectiveRef,
    currentIsMarkdown ? currentRepoPath : null,
  )
  const base = useMemo(
    () => ({
      content: remote.data?.content ?? null,
      lastCommitId: remote.data?.lastCommitId ?? null,
    }),
    [remote.data],
  )
  const change = currentRepoPath ? draft?.changes[currentRepoPath] : undefined
  const editorValue =
    change?.kind === "text" || change?.kind === "move"
      ? (change.content ?? "")
      : (remote.data?.content ?? "")
  const fileMissing =
    remote.status === "ready" && remote.data === null && !change
  const fileDeleted = change?.kind === "delete"

  const resolver = useAssetResolver(
    client,
    effectiveProjectId,
    effectiveRef,
    draft,
  )
  const editorRef = useRef<EditorHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [panel, setPanel] = useState<Panel>("none")
  const [imageFiles, setImageFiles] = useState<File[] | null>(null)
  const [commitOpen, setCommitOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState<string | null>(null)
  const [newFileDir, setNewFileDir] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [compileFailure, setCompileFailure] = useState<CompileProblem | null>(
    null,
  )
  const [formatting, setFormatting] = useState(false)
  const [blameOn, setBlameOn] = useState(false)

  const mergeRequest = useMergeRequest(
    client,
    ws?.upstream ?? null,
    reading,
    location.branch,
    !onDefaultBranch && branchExists,
  )
  const mrIid = mergeRequest.data?.iid ?? null
  const upstreamId = ws?.upstream.id ?? null
  const discussions = useAsync(
    mrIid === null || upstreamId === null
      ? null
      : () => client.listDiscussions(upstreamId, mrIid),
    [client, upstreamId, mrIid],
  )
  const [mrTab, setMrTab] = useState<MergeRequestTab>("overview")
  const [jumpTo, setJumpTo] = useState<{
    file: string
    line: number | null
  } | null>(null)
  const openDiscussions = discussions.data
    ? openDiscussionCount(discussions.data)
    : 0

  const draftShape = draft ? shapeOf(draft) : ""
  const structural = useMemo(
    () => draft ?? emptyChangeset(0, "", null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftShape],
  )
  const draftRef = useRef(draft)
  draftRef.current = draft

  const knownFiles = useMemo(() => {
    const files = new Set((tree.data ?? []).map((file) => file.file))
    const current = structural
    for (const path of movedFromPaths(current)) {
      const file = fileFor(config, path)
      if (file) files.delete(file)
    }
    for (const path of changedPaths(current)) {
      const file = fileFor(config, path)
      if (!file) continue
      if (current.changes[path]?.kind === "delete") files.delete(file)
      else files.add(file)
    }
    return files
  }, [tree.data, structural, config])
  const existingRepoPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const file of tree.data ?? []) paths.add(file.repoPath)
    const current = structural
    for (const path of movedFromPaths(current)) paths.delete(path)
    for (const path of changedPaths(current)) {
      if (current.changes[path]?.kind === "delete") paths.delete(path)
      else paths.add(path)
    }
    return paths
  }, [tree.data, structural])

  const loadSourceFile = useCallback(
    async (repoPath: string) => {
      const local = draftRef.current?.changes[repoPath]
      if (local?.kind === "text" || local?.kind === "move") return local.content
      if (local?.kind === "delete" || effectiveProjectId === null) return null
      const remoteFile = await fetchRemoteFile(
        client,
        effectiveProjectId,
        effectiveRef,
        repoPath,
      )
      return remoteFile?.content ?? null
    },
    [client, effectiveProjectId, effectiveRef],
  )
  const loadFileText = useCallback(
    (file: string) => loadSourceFile(repoPathFor(config, file)),
    [loadSourceFile, config],
  )

  const lintNotes = useMemo<LintNote[]>(() => {
    if (!currentRepoPath || !discussions.data) return []
    const notes: LintNote[] = []
    for (const discussion of discussions.data) {
      const first = discussion.notes.find((note) => !note.system)
      if (!first?.position || first.position.new_path !== currentRepoPath)
        continue
      if (first.resolvable && first.resolved) continue
      if (first.position.new_line === null) continue
      const replies = discussion.notes.filter((note) => !note.system).length - 1
      notes.push({
        line: first.position.new_line,
        message: `${first.author.name}: ${first.body}${replies > 0 ? ` (${replies} ${replies === 1 ? "reply" : "replies"})` : ""}`,
      })
    }
    return notes
  }, [currentRepoPath, discussions.data])

  const lintContext = useMemo<LintContext | null>(
    () =>
      currentFile && currentIsMarkdown
        ? {
            file: currentFile,
            format: currentFormat,
            config,
            knownFiles,
            existingRepoPaths,
            compileFailure,
            notes: lintNotes,
            manualSidebar:
              versionForFile(outline, currentFile)?.manual ?? false,
          }
        : null,
    [
      currentFile,
      currentIsMarkdown,
      currentFormat,
      config,
      knownFiles,
      existingRepoPaths,
      compileFailure,
      lintNotes,
      outline,
    ],
  )
  const linkContext = useMemo<LinkContext | null>(
    () =>
      currentFile
        ? {
            file: currentFile,
            files: (tree.data ?? [])
              .filter((file) => file.kind === "markdown")
              .map((file) => file.file),
            loadFile: loadFileText,
          }
        : null,
    [currentFile, tree.data, loadFileText],
  )

  const onEditorChange = useCallback(
    (value: string) => {
      if (!currentRepoPath || remote.status !== "ready") return
      updateDraft((current) =>
        withTextChange(current, currentRepoPath, value, base),
      )
    },
    [currentRepoPath, remote.status, base, updateDraft],
  )

  const selectFile = useCallback(
    (file: string) => {
      setPanel("none")
      setLocation({ file })
    },
    [setLocation],
  )

  const openFileAt = useCallback(
    (file: string, line: number | null) => {
      setJumpTo({ file, line })
      selectFile(file)
    },
    [selectFile],
  )

  useEffect(() => {
    if (!jumpTo || jumpTo.file !== currentFile || remote.status !== "ready")
      return
    if (jumpTo.line !== null) editorRef.current?.scrollToLine(jumpTo.line)
    setJumpTo(null)
  }, [jumpTo, currentFile, remote.status])

  const currentLine = useCallback(() => {
    const view = editorRef.current?.view()
    if (!view) return null
    return view.state.doc.lineAt(view.state.selection.main.head).number
  }, [])

  const onPreviewError = useCallback(
    (failure: { message: string; line: number | null } | null) =>
      setCompileFailure(
        failure ? { message: failure.message, line: failure.line } : null,
      ),
    [],
  )

  const renderPreview = useCallback<RenderPreview>(
    (source, file, highlight) => (
      <Preview
        source={source}
        file={file}
        config={config}
        adapter={adapter}
        location={location}
        onNavigate={selectFile}
        loadFile={loadFileText}
        knownFiles={knownFiles}
        highlight={highlight}
        debounceMs={0}
        className="min-h-0 flex-1 overflow-auto p-4"
      />
    ),
    [config, adapter, location, selectFile, loadFileText, knownFiles],
  )

  const startEditing = useCallback(
    async (branch: string, isNew: boolean) => {
      if (!ws || !writeTarget) throw new Error("Workspace is not ready.")
      let created: "created" | "pending" = "created"
      if (isNew) {
        created = await createWorkBranch(
          client,
          ws,
          writeTarget,
          branch,
          config.defaultBranch,
        )
      }
      setStartRequested(false)
      setPanel("none")
      setLocation({ branch, mode: "edit", project: null })
      branches.reload()
      if (created === "pending") {
        setNotice(
          `Your fork is behind ${ws.upstream.path_with_namespace}. The branch ${branch} is created from ${config.defaultBranch} with your first commit.`,
        )
      }
    },
    [ws, writeTarget, client, config.defaultBranch, setLocation, branches],
  )

  const createFork = useCallback(async () => {
    if (!ws) throw new Error("Workspace is not ready.")
    await ensureFork(client, ws)
    workspace.reload()
  }, [ws, client, workspace])

  const selectFork = useCallback(
    (fork: GitLabProject) => {
      if (!ws) return
      rememberFork(ws.upstream.id, fork.id)
      workspace.reload()
    },
    [ws, workspace],
  )

  const commitWith = useCallback(
    async (source: ChangesetData, message: string) => {
      if (!ws || !reading || !writeTarget)
        throw new Error("Workspace is not ready.")
      if (!signedIn) throw new Error("Sign in first.")
      let prepared: ChangesetData = source
      for (const path of changedPaths(source)) {
        const entry = source.changes[path]!
        if (entry.kind !== "text" || !isMarkdownFile(path)) continue
        try {
          const formatted = await formatMarkdown(entry.content, path)
          prepared = {
            ...prepared,
            changes: {
              ...prepared.changes,
              [path]: { ...entry, content: formatted },
            },
          }
        } catch {
          continue
        }
      }
      const exists =
        (await client.getBranch(writeTarget.id, location.branch)) !== null
      try {
        await client.commit(writeTarget.id, {
          branch: location.branch,
          commit_message: message,
          actions: toCommitActions(prepared),
          ...(exists
            ? {}
            : {
                start_branch: config.defaultBranch,
                start_project: ws.upstream.id,
              }),
        })
      } catch (error) {
        if (error instanceof GitLabError && error.status === 400 && exists) {
          const found = await findConflicts(
            client,
            writeTarget.id,
            location.branch,
            prepared,
          )
          if (found.length > 0) {
            setConflicts({ message, files: found })
            setCommitOpen(false)
            return
          }
        }
        throw error
      }
      updateDraft((current) => ({ ...current, changes: {} }))
      invalidateRemoteFiles()
      invalidateRemoteAssets()
      invalidateLastChanges()
      setCommitOpen(false)
      setNotice(`Committed to ${location.branch}.`)
      tree.reload()
      branches.reload()
      remote.reload()
      mergeRequest.reload()
    },
    [
      ws,
      reading,
      writeTarget,
      signedIn,
      client,
      config.defaultBranch,
      location.branch,
      tree,
      branches,
      remote,
      mergeRequest,
      updateDraft,
    ],
  )

  const commit = useCallback(
    (message: string) => {
      if (!draft) throw new Error("Workspace is not ready.")
      return commitWith(draft, message)
    },
    [draft, commitWith],
  )

  const [conflicts, setConflicts] = useState<{
    message: string
    files: ConflictFile[]
  } | null>(null)

  const resolveConflicts = useCallback(
    async (decisions: Record<string, ConflictDecision>) => {
      if (!conflicts || !draft) return
      let next = draft
      for (const file of conflicts.files) {
        const decision = decisions[file.repoPath] ?? "mine"
        const entry = next.changes[file.repoPath]
        if (!entry) continue
        if (decision === "theirs") {
          next = withoutChange(next, file.repoPath)
          continue
        }
        if (file.theirsCommit === null) {
          if (entry.kind === "delete") {
            next = withoutChange(next, file.repoPath)
          } else if (entry.kind === "text" || entry.kind === "binary") {
            next = {
              ...next,
              changes: {
                ...next.changes,
                [file.repoPath]: { ...entry, base: MISSING_BASE },
              },
            }
          }
          continue
        }
        next = {
          ...next,
          changes: {
            ...next.changes,
            [file.repoPath]: {
              ...entry,
              base: { content: file.theirs, lastCommitId: file.theirsCommit },
            },
          },
        }
      }
      updateDraft(() => next)
      invalidateRemoteFiles()
      remote.reload()
      setConflicts(null)
      if (!isDirty(next)) {
        setNotice("Nothing left to commit after taking their changes.")
        return
      }
      await commitWith(next, conflicts.message)
    },
    [conflicts, draft, updateDraft, remote, commitWith],
  )

  const formatCurrent = useCallback(async () => {
    const view = editorRef.current?.view()
    if (!view || !currentFile) return
    setFormatting(true)
    try {
      const formatted = await formatMarkdown(
        view.state.doc.toString(),
        currentFile,
      )
      replaceDocument(view, formatted)
    } catch (error) {
      setNotice(`Could not format: ${describeError(error)}`)
    } finally {
      setFormatting(false)
    }
  }, [currentFile])

  const onEditorAction = useCallback((action: SnippetAction) => {
    if (action === "image") fileInput.current?.click()
    if (action === "link") {
      const view = editorRef.current?.view()
      const selection = view
        ? view.state.sliceDoc(
            view.state.selection.main.from,
            view.state.selection.main.to,
          )
        : ""
      setLinkOpen(selection)
    }
  }, [])

  const formatDrafts = useCallback(async (): Promise<number> => {
    if (!draft) return 0
    const formatted: Record<string, string> = {}
    for (const path of changedPaths(draft)) {
      const entry = draft.changes[path]!
      if (entry.kind !== "text" || !isMarkdownFile(path)) continue
      try {
        const next = await formatMarkdown(entry.content, path)
        if (next !== entry.content) formatted[path] = next
      } catch {
        continue
      }
    }
    const count = Object.keys(formatted).length
    if (count > 0) {
      updateDraft((current) => {
        let next = current
        for (const [path, content] of Object.entries(formatted)) {
          const entry = next.changes[path]
          if (entry?.kind !== "text") continue
          next = {
            ...next,
            changes: { ...next.changes, [path]: { ...entry, content } },
          }
        }
        return next
      })
    }
    return count
  }, [draft, updateDraft])

  const [formattedCount, setFormattedCount] = useState(0)
  const openCommit = useCallback(async () => {
    setFormatting(true)
    try {
      setFormattedCount(await formatDrafts())
    } finally {
      setFormatting(false)
    }
    setCommitOpen(true)
  }, [formatDrafts])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault()
        if (editing && draft && isDirty(draft)) void openCommit()
      }
      if (event.altKey && event.shiftKey && event.code === "KeyF") {
        event.preventDefault()
        if (editing) void formatCurrent()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [draft, editing, openCommit, formatCurrent])

  const versionClass = versionForFile(outline, currentFile)?.className ?? null
  useEffect(() => {
    if (!versionClass) return
    document.documentElement.classList.add(versionClass)
    return () => document.documentElement.classList.remove(versionClass)
  }, [versionClass])

  useEffect(() => {
    if (!notice) return
    const handle = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(handle)
  }, [notice])

  const placeImages = async (
    placements: {
      file: File
      destination: { repoPath: string; markdownUrl: string }
      alt: string
    }[],
  ) => {
    const snippets: string[] = []
    for (const placement of placements) {
      const base64 = await fileToBase64(placement.file)
      updateDraft((current) =>
        withBinaryChange(
          current,
          placement.destination.repoPath,
          base64,
          placement.file.type || "image/png",
        ),
      )
      snippets.push(`![${placement.alt}](${placement.destination.markdownUrl})`)
    }
    setImageFiles(null)
    editorRef.current?.insertAtCursor(`${snippets.join("\n\n")}\n`)
  }

  const replaceImage = async (repoPath: string, file: File) => {
    if (effectiveProjectId === null) return
    const base64 = await fileToBase64(file)
    const lastCommitId =
      (await client
        .lastCommitFor(effectiveProjectId, effectiveRef, repoPath)
        .catch(() => null)) ?? ""
    updateDraft((current) =>
      withBinaryChange(current, repoPath, base64, file.type || "image/png", {
        content: null,
        lastCommitId,
      }),
    )
    invalidateRemoteAssets()
  }

  const deleteImage = async (repoPath: string) => {
    if (effectiveProjectId === null) return
    const lastCommitId =
      (await client
        .lastCommitFor(effectiveProjectId, effectiveRef, repoPath)
        .catch(() => null)) ?? ""
    updateDraft((current) =>
      withDeletion(current, repoPath, { content: null, lastCommitId }),
    )
  }

  const workingEntries = useMemo<DiffEntry[]>(() => {
    if (!draft) return []
    return changedPaths(draft).map((path) => {
      const entry = draft.changes[path]!
      if (entry.kind === "delete") {
        return {
          repoPath: path,
          kind: "deleted",
          before: entry.base.content,
          after: null,
        }
      }
      if (entry.kind === "binary") {
        return {
          repoPath: path,
          kind: entry.base.lastCommitId ? "modified" : "added",
          before: null,
          after: null,
          binaryUrl: `data:${entry.mime};base64,${entry.base64}`,
        }
      }
      if (entry.kind === "move") {
        return {
          repoPath: path,
          kind: "renamed",
          renamedFrom: entry.from,
          before: entry.base.content,
          after: entry.content,
        }
      }
      return {
        repoPath: path,
        kind: entry.base.lastCommitId ? "modified" : "added",
        before: entry.base.content,
        after: entry.content,
      }
    })
  }, [draft])

  const dirty = draft ? isDirty(draft) : false
  const allChanged = useMemo(() => changedPaths(structural), [structural])
  const changedFiles = useMemo(
    () => new Set(allChanged.map((path) => fileFor(config, path) ?? path)),
    [allChanged, config],
  )
  const deletedFiles = useMemo(
    () =>
      new Set(
        [
          ...allChanged.filter(
            (path) => structural.changes[path]?.kind === "delete",
          ),
          ...movedFromPaths(structural),
        ].map((path) => fileFor(config, path) ?? path),
      ),
    [allChanged, structural, config],
  )
  const newFiles = useMemo(
    () =>
      allChanged
        .filter((path) => {
          const entry = structural.changes[path]
          if (!entry || entry.kind === "delete") return false
          return entry.kind === "move" || entry.base.lastCommitId === null
        })
        .map((path) => fileFor(config, path) ?? path),
    [allChanged, structural, config],
  )
  const directories = useMemo(() => {
    const set = new Set<string>()
    for (const file of knownFiles) {
      let dir = dirname(file)
      while (dir) {
        set.add(dir)
        dir = dirname(dir)
      }
    }
    return [...set]
  }, [knownFiles])

  const [treeView, setTreeView] = useState<TreeView>(() => {
    try {
      return localStorage.getItem("studio:treeView") === "files"
        ? "files"
        : "sidebar"
    } catch {
      return "sidebar"
    }
  })
  const changeTreeView = useCallback((view: TreeView) => {
    setTreeView(view)
    try {
      localStorage.setItem("studio:treeView", view)
    } catch {
      return
    }
  }, [])
  const [moving, setMoving] = useState<string | null>(null)
  const sidebarModels = useSidebarModels(
    client,
    effectiveProjectId,
    effectiveRef,
    outline,
    draft,
    config,
  )
  const onSidebarEdit = useCallback(
    (repoPath: string, sidebars: SidebarsJson) => {
      const model = sidebarModels.find((m) => m.repoPath === repoPath)
      if (!model) return
      updateDraft((current) =>
        withTextChange(
          current,
          repoPath,
          serializeSidebars(sidebars),
          model.base,
        ),
      )
    },
    [sidebarModels, updateDraft],
  )
  const onTreeNewFile = useCallback((dir: string) => setNewFileDir(dir), [])
  const onTreeMove = useCallback((file: string) => setMoving(file), [])

  const moveFile = useCallback(
    async (fromFile: string, toFile: string) => {
      if (!draft || effectiveProjectId === null || fromFile === toFile) return
      const fromRepo = repoPathFor(config, fromFile)
      const toRepo = repoPathFor(config, toFile)
      if (existingRepoPaths.has(toRepo)) {
        setNotice(`${toFile} already exists.`)
        return
      }
      const existing = draft.changes[fromRepo]
      let content: string | null = null
      let base = MISSING_BASE
      if (existing?.kind === "text" || existing?.kind === "move") {
        content = existing.content
        base = existing.base
      } else if (isMarkdownFile(fromFile)) {
        const remoteFile = await fetchRemoteFile(
          client,
          effectiveProjectId,
          effectiveRef,
          fromRepo,
        )
        if (!remoteFile) {
          setNotice(`${fromFile} does not exist on ${effectiveRef}.`)
          return
        }
        content = remoteFile.content
        base = {
          content: remoteFile.content,
          lastCommitId: remoteFile.lastCommitId,
        }
      } else if (existing?.kind !== "binary") {
        const lastCommitId = await client
          .lastCommitFor(effectiveProjectId, effectiveRef, fromRepo)
          .catch(() => null)
        base = { content: null, lastCommitId: lastCommitId ?? "" }
      }
      if (content !== null && isMarkdownFile(fromFile)) {
        content = rebaseRelativeLinks(content, fromFile, toFile)
      }
      updateDraft((current) =>
        withMove(current, fromRepo, toRepo, content, base),
      )
      invalidateRemoteAssets()
      if (currentFile === fromFile) setLocation({ file: toFile }, false)
      setMoving(null)
    },
    [
      draft,
      effectiveProjectId,
      effectiveRef,
      config,
      existingRepoPaths,
      client,
      updateDraft,
      currentFile,
      setLocation,
    ],
  )
  const onTreeDrop = useCallback(
    (file: string, directory: string) =>
      void moveFile(file, joinPath(directory, basename(file))),
    [moveFile],
  )

  const shareSearch = buildLocationSearch(
    {
      ...location,
      mode: "view",
      project:
        reading && ws && reading.id !== ws.upstream.id
          ? reading.path_with_namespace
          : null,
    },
    config,
  )
  const shareUrl = `${window.location.origin}${config.editPath}${shareSearch}`
  const targetLabel = writeTarget
    ? writeTarget.id === ws?.upstream.id
      ? writeTarget.path_with_namespace
      : `your fork ${writeTarget.path_with_namespace}`
    : ""

  const requestEdit = () => {
    if (canEdit) setLocation({ mode: "edit" })
    else setStartRequested(true)
  }

  const closeStart = () => {
    setStartRequested(false)
    if (location.mode === "edit" && !editing) setLocation({ mode: "view" })
  }

  const onBranchPick = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (value === "__new__") {
      setStartRequested(true)
      return
    }
    setPanel("none")
    setLocation({
      branch: value,
      mode: value === config.defaultBranch ? "view" : location.mode,
    })
  }

  const branchMissing =
    ws !== null &&
    reading !== null &&
    branches.status === "ready" &&
    !branchExists &&
    !pendingBranch
  const bannerError =
    authError ??
    (workspace.error ? describeError(workspace.error) : null) ??
    (tree.error ? describeError(tree.error) : null) ??
    (branchMissing
      ? `Branch ${location.branch} does not exist in ${reading.path_with_namespace}.`
      : null)
  const bannerInfo =
    notice ??
    (pendingBranch
      ? `${location.branch} does not exist in ${reading?.path_with_namespace} yet. You are reading ${config.defaultBranch} of ${ws?.upstream.path_with_namespace}, the branch is created with your first commit.`
      : null)

  const previewClass = `min-h-0 flex-1 overflow-auto p-4 ${editing ? "" : "studio-reading"}`

  const lastChange = useLastChange(
    client,
    effectiveProjectId,
    effectiveRef,
    currentIsMarkdown ? currentRepoPath : null,
  )
  const blameData = useAsync(
    blameOn && editing && effectiveProjectId !== null && currentRepoPath
      ? () =>
          client
            .blame(effectiveProjectId, effectiveRef, currentRepoPath)
            .then(blameRanges)
      : null,
    [blameOn, editing, effectiveProjectId, effectiveRef, currentRepoPath],
  )
  const blame = blameOn && !change ? blameData.data : null

  return (
    <AssetProvider resolver={resolver}>
      <div
        className="studio-root bg-surface flex flex-col"
        data-mode={editing ? "edit" : "view"}
      >
        <header className="border-line bg-raised flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-[15px] font-semibold">
              Docs studio
            </span>
            <label className="text-muted flex items-center gap-1.5 text-[13px]">
              Branch
              <select
                className={`${input} w-auto max-w-56`}
                value={location.branch}
                onChange={onBranchPick}
              >
                {!branches.data?.some(
                  (branch) => branch.name === location.branch,
                ) && <option value={location.branch}>{location.branch}</option>}
                {branches.data
                  ?.slice()
                  .sort((a, b) =>
                    a.default
                      ? -1
                      : b.default
                        ? 1
                        : a.name.localeCompare(b.name),
                  )
                  .map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                {signedIn && <option value="__new__">New branch…</option>}
              </select>
            </label>
            {reading && ws && reading.id !== ws.upstream.id && (
              <span className="bg-line rounded-full px-2 py-0.5 text-[12px]">
                {reading.path_with_namespace}
              </span>
            )}
            {mergeRequest.data && (
              <a
                href={mergeRequest.data.web_url}
                target="_blank"
                rel="noreferrer"
                className="border-line text-muted hover:text-ink inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px]"
                title={mergeRequest.data.title}
              >
                !{mergeRequest.data.iid}
                <PipelineBadge mr={mergeRequest.data} compact />
              </a>
            )}
            {mergeRequest.data && openDiscussions > 0 && (
              <button
                type="button"
                className="border-line text-muted hover:text-ink inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]"
                title="Open review comments"
                onClick={() => {
                  setMrTab("comments")
                  setPanel("mr")
                }}
              >
                {openDiscussions}{" "}
                {openDiscussions === 1 ? "comment" : "comments"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editing && (
              <button
                type="button"
                className={button}
                aria-pressed={panel === "diff"}
                onClick={() => setPanel(panel === "diff" ? "none" : "diff")}
              >
                Changes{dirty ? ` (${allChanged.length})` : ""}
              </button>
            )}
            <button
              type="button"
              className={button}
              aria-pressed={panel === "history"}
              onClick={() => setPanel(panel === "history" ? "none" : "history")}
            >
              History
            </button>
            {!onDefaultBranch && (
              <button
                type="button"
                className={button}
                aria-pressed={panel === "mr"}
                onClick={() => setPanel(panel === "mr" ? "none" : "mr")}
              >
                Merge request
              </button>
            )}
            {editing ? (
              <>
                <button
                  type="button"
                  className={buttonPrimary}
                  disabled={!dirty || formatting}
                  onClick={() => void openCommit()}
                >
                  {formatting
                    ? "Formatting…"
                    : `Commit${dirty ? ` (${allChanged.length})` : ""}`}
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => {
                    setPanel("none")
                    setLocation({ mode: "view" })
                  }}
                >
                  Done
                </button>
              </>
            ) : (
              <button
                type="button"
                className={buttonPrimary}
                onClick={requestEdit}
              >
                Edit
              </button>
            )}
            {signedIn ? (
              <button
                type="button"
                className={ghostButton}
                onClick={() => session.signOut()}
                title="Sign out"
              >
                {ws?.user ? `@${ws.user.username}` : "Signed in"} · Sign out
              </button>
            ) : session.canSignIn ? (
              <button
                type="button"
                className={ghostButton}
                onClick={() =>
                  session.signIn(
                    `${window.location.pathname}${window.location.search}`,
                  )
                }
              >
                Sign in with GitLab
              </button>
            ) : null}
          </div>
        </header>

        {(bannerError || bannerInfo) && (
          <div
            className={`border-b px-3 py-1.5 text-[13px] ${bannerError ? "border-danger/40 bg-removed text-danger" : "border-line bg-raised text-muted"}`}
            role={bannerError ? "alert" : "status"}
          >
            {bannerError ?? bannerInfo}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <aside className="border-line bg-raised w-64 shrink-0 overflow-auto border-r py-2 max-md:w-48">
            {tree.status === "loading" && (
              <p className={`px-3 ${hint}`}>Loading files…</p>
            )}
            {tree.status === "error" && (
              <p className={`px-3 ${errorText}`}>{describeError(tree.error)}</p>
            )}
            {tree.data && (
              <FileTree
                files={tree.data}
                selected={currentFile}
                changed={changedFiles}
                deleted={deletedFiles}
                newFiles={newFiles}
                outline={outline}
                models={sidebarModels}
                onSidebarEdit={editing ? onSidebarEdit : undefined}
                view={treeView}
                onViewChange={changeTreeView}
                onSelect={selectFile}
                onNewFile={editing ? onTreeNewFile : undefined}
                onMove={editing ? onTreeMove : undefined}
                onDrop={editing ? onTreeDrop : undefined}
                showImages={editing}
              />
            )}
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            {panel === "diff" && draft && (
              <DiffPanel
                entries={workingEntries}
                config={config}
                renderPreview={renderPreview}
                title="Uncommitted changes"
                emptyMessage="No uncommitted changes."
                actions={
                  workingEntries.length > 0 ? (
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        if (
                          window.confirm("Discard all uncommitted changes?")
                        ) {
                          updateDraft((current) => ({
                            ...current,
                            changes: {},
                          }))
                        }
                      }}
                    >
                      Discard all
                    </button>
                  ) : null
                }
              />
            )}
            {panel === "history" && reading && ws && effectiveProjectId && (
              <HistoryPanel
                client={client}
                projectId={effectiveProjectId}
                branch={effectiveRef}
                defaultBranch={config.defaultBranch}
                upstreamProjectId={ws.upstream.id}
                scopePath={currentIsMarkdown ? currentRepoPath : null}
                config={config}
                renderPreview={renderPreview}
              />
            )}
            {panel === "mr" && ws && reading && (
              <MergeRequestPanel
                client={client}
                upstream={ws.upstream}
                source={reading}
                branch={location.branch}
                defaultBranch={config.defaultBranch}
                shareUrl={shareUrl}
                signedIn={signedIn}
                canWrite={writeTarget !== null && writeTarget.id === reading.id}
                branchExists={branchExists}
                mergeRequest={mergeRequest}
                discussions={discussions}
                config={config}
                renderPreview={renderPreview}
                loadSourceFile={loadSourceFile}
                currentFile={currentFile}
                currentLine={currentLine}
                onOpenFile={openFileAt}
                tab={mrTab}
                onTabChange={setMrTab}
              />
            )}
            {panel === "none" && !currentFile && (
              <div className="text-muted mx-auto max-w-xl p-8 text-[14px]">
                <h1 className="font-heading text-ink text-2xl">Docs studio</h1>
                <p>
                  Pick a page on the left to {editing ? "edit" : "read"} it.
                  {!editing && " Press Edit when you want to change something."}
                </p>
                {editing && (
                  <ul className="mt-3 list-disc pl-5">
                    <li>
                      Edits stay in this browser until you commit them to{" "}
                      <code className="font-mono">{location.branch}</code>.
                    </li>
                    <li>
                      Type / in the editor for headings, admonitions, tables and
                      more. Paste or drop an image and you will be asked where
                      it should go.
                    </li>
                    <li>
                      Commit writes to the branch, Merge request opens or shows
                      the review for it.
                    </li>
                  </ul>
                )}
              </div>
            )}
            {panel === "none" && currentFile && currentIsMarkdown && (
              <div
                className={`grid min-h-0 flex-1 ${editing ? "grid-cols-2 max-md:grid-cols-1 max-md:grid-rows-2" : "grid-cols-1"}`}
              >
                {editing && (
                  <div className="border-line flex min-h-0 min-w-0 flex-col border-r max-md:border-r-0 max-md:border-b">
                    <div className={paneHeader}>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="truncate font-mono text-[12px]">
                          {currentFile}
                        </span>
                        <LastChanged state={lastChange} className="truncate" />
                        {blameOn && change && (
                          <span className="text-faint text-[12px]">
                            Blame hides while the page has uncommitted edits
                          </span>
                        )}
                        {blameOn && blameData.status === "error" && (
                          <span className="text-danger text-[12px]">
                            {describeError(blameData.error)}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        {change && !fileDeleted && (
                          <button
                            type="button"
                            className={ghostButton}
                            onClick={() => {
                              const from =
                                change.kind === "move"
                                  ? fileFor(config, change.from)
                                  : null
                              updateDraft((current) =>
                                withoutChange(current, currentRepoPath!),
                              )
                              if (from) setLocation({ file: from }, false)
                            }}
                          >
                            {change.kind === "move" ? "Undo move" : "Revert"}
                          </button>
                        )}
                        {!fileDeleted && remote.data && (
                          <button
                            type="button"
                            className={ghostButton}
                            onClick={() => {
                              if (window.confirm(`Delete ${currentFile}?`)) {
                                updateDraft((current) =>
                                  withDeletion(current, currentRepoPath!, base),
                                )
                              }
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    {fileDeleted ? (
                      <div className="p-6">
                        <p className={hint}>
                          This page is marked for deletion.
                        </p>
                        <button
                          type="button"
                          className={button}
                          onClick={() =>
                            updateDraft((current) =>
                              withoutChange(current, currentRepoPath!),
                            )
                          }
                        >
                          Undo
                        </button>
                      </div>
                    ) : fileMissing ? (
                      <div className="p-6">
                        <p className={hint}>
                          This file does not exist on {effectiveRef}.
                        </p>
                      </div>
                    ) : remote.status === "error" ? (
                      <div className="p-6">
                        <p className={errorText}>
                          {describeError(remote.error)}
                        </p>
                      </div>
                    ) : (
                      <>
                        <Toolbar
                          editorRef={editorRef}
                          format={currentFormat}
                          disabled={remote.status !== "ready"}
                          onImage={() => fileInput.current?.click()}
                          onLink={() => onEditorAction("link")}
                          onFormat={formatCurrent}
                          formatting={formatting}
                          onBlame={() => setBlameOn((value) => !value)}
                          blameOn={blameOn}
                        />
                        <Editor
                          ref={editorRef}
                          value={editorValue}
                          format={currentFormat}
                          onChange={onEditorChange}
                          onImageFiles={(files) => setImageFiles(files)}
                          onAction={onEditorAction}
                          lintContext={lintContext}
                          linkContext={linkContext}
                          readOnly={remote.status !== "ready"}
                          blame={blame}
                        />
                      </>
                    )}
                  </div>
                )}
                <div className="flex min-h-0 min-w-0 flex-col">
                  {editing && (
                    <div className={paneHeader}>
                      <span>Preview</span>
                      {compileFailure && (
                        <span className="text-danger">
                          Preview has an error
                          {compileFailure.line
                            ? ` on line ${compileFailure.line}`
                            : ""}
                        </span>
                      )}
                    </div>
                  )}
                  {!editing && lastChange.data && (
                    <div className="border-line bg-raised border-b px-4 py-1">
                      <LastChanged state={lastChange} />
                    </div>
                  )}
                  {!fileDeleted &&
                    !fileMissing &&
                    (remote.status === "ready" || change) && (
                      <Preview
                        source={editorValue}
                        file={currentFile}
                        config={config}
                        adapter={adapter}
                        location={location}
                        onNavigate={selectFile}
                        loadFile={loadFileText}
                        knownFiles={knownFiles}
                        onError={onPreviewError}
                        className={previewClass}
                      />
                    )}
                  {!editing && fileMissing && (
                    <p className={`p-6 ${hint}`}>
                      This page does not exist on {effectiveRef}.
                    </p>
                  )}
                  {!editing && remote.status === "error" && (
                    <p className={`p-6 ${errorText}`}>
                      {describeError(remote.error)}
                    </p>
                  )}
                </div>
              </div>
            )}
            {panel === "none" &&
              currentFile &&
              isImageFile(currentFile) &&
              currentRepoPath && (
                <ImageView
                  repoPath={currentRepoPath}
                  file={currentFile}
                  deleted={fileDeleted}
                  replaced={change?.kind === "binary"}
                  onDelete={
                    editing ? () => deleteImage(currentRepoPath) : undefined
                  }
                  onReplace={
                    editing
                      ? (file) => replaceImage(currentRepoPath, file)
                      : undefined
                  }
                  onUndo={() =>
                    updateDraft((current) =>
                      withoutChange(current, currentRepoPath),
                    )
                  }
                />
              )}
          </main>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ""
            if (files.length > 0) setImageFiles(files)
          }}
        />

        {imageFiles && currentFile && (
          <ImagePasteDialog
            files={imageFiles}
            docFile={currentFile}
            config={config}
            existingPaths={existingRepoPaths}
            onConfirm={placeImages}
            onClose={() => setImageFiles(null)}
          />
        )}
        {linkOpen !== null && currentFile && (
          <LinkDialog
            currentFile={currentFile}
            files={(tree.data ?? []).map((file) => file.file)}
            loadFile={loadFileText}
            initialText={linkOpen}
            onInsert={(markdown) => {
              setLinkOpen(null)
              editorRef.current?.insertAtCursor(markdown)
            }}
            onClose={() => setLinkOpen(null)}
          />
        )}
        {commitOpen && draft && (
          <CommitDialog
            branch={location.branch}
            targetLabel={targetLabel}
            formattedCount={formattedCount}
            changedFiles={allChanged.map(
              (path) => fileFor(config, path) ?? path,
            )}
            onConfirm={commit}
            onClose={() => setCommitOpen(false)}
          />
        )}
        {showStart && (
          <StartEditingDialog
            workspace={ws}
            signedIn={signedIn}
            canSignIn={session.canSignIn}
            branches={(branches.data ?? []).map((branch) => branch.name)}
            defaultBranch={config.defaultBranch}
            seedName={currentFile ? basename(currentFile) : "update"}
            onSignIn={() =>
              session.signIn(
                `${window.location.pathname}${buildLocationSearch({ ...location, mode: "edit" }, config)}`,
              )
            }
            onCreateFork={createFork}
            onSelectFork={selectFork}
            onStart={startEditing}
            onClose={closeStart}
          />
        )}
        {conflicts && (
          <ConflictDialog
            files={conflicts.files}
            branch={location.branch}
            config={config}
            onResolve={resolveConflicts}
            onClose={() => setConflicts(null)}
          />
        )}
        {moving !== null && (
          <MoveDialog
            file={moving}
            directories={directories}
            config={config}
            existingPaths={existingRepoPaths}
            onConfirm={(target) => void moveFile(moving, target)}
            onClose={() => setMoving(null)}
          />
        )}
        {newFileDir !== null && (
          <NewFileDialog
            directory={newFileDir}
            config={config}
            existingPaths={existingRepoPaths}
            onConfirm={(file, title) => {
              const repoPath = repoPathFor(config, file)
              updateDraft((current) =>
                withTextChange(
                  current,
                  repoPath,
                  `---\ntitle: ${title}\n---\n\n`,
                  MISSING_BASE,
                ),
              )
              setNewFileDir(null)
              selectFile(file)
            }}
            onClose={() => setNewFileDir(null)}
          />
        )}
      </div>
    </AssetProvider>
  )
}

function ImageView({
  repoPath,
  file,
  deleted,
  replaced,
  onDelete,
  onReplace,
  onUndo,
}: {
  repoPath: string
  file: string
  deleted: boolean
  replaced: boolean
  onDelete?: () => void
  onReplace?: (file: File) => void
  onUndo: () => void
}) {
  const src = useResolvedAsset(`studio-asset:${repoPath}`)
  const picker = useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={paneHeader}>
        <span className="truncate font-mono text-[12px]">{file}</span>
        <div className="flex items-center gap-1">
          {deleted || replaced ? (
            <button type="button" className={ghostButton} onClick={onUndo}>
              {deleted ? "Undo delete" : "Undo replace"}
            </button>
          ) : null}
          {!deleted && onReplace && (
            <>
              <button
                type="button"
                className={ghostButton}
                onClick={() => picker.current?.click()}
              >
                Replace
              </button>
              <input
                ref={picker}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const picked = event.target.files?.[0]
                  event.target.value = ""
                  if (picked) onReplace(picked)
                }}
              />
            </>
          )}
          {!deleted && onDelete && (
            <button
              type="button"
              className={ghostButton}
              onClick={() => {
                if (window.confirm(`Delete ${file}?`)) onDelete()
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        {deleted ? (
          <p className={hint}>Marked for deletion.</p>
        ) : src ? (
          <img
            src={src}
            alt={file}
            className="border-line max-h-full max-w-full rounded-md border"
          />
        ) : (
          <p className={hint}>Loading…</p>
        )}
      </div>
    </div>
  )
}
