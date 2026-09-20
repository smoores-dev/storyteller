import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import { AuthSession } from "../auth/pkce"
import {
  type StudioConfig,
  type StudioLocation,
  buildLocationSearch,
  isImageFile,
  isMarkdownFile,
  joinPath,
  parseLocation,
} from "../config"
import {
  GitLabClient,
  GitLabError,
  type GitLabMergeRequestDetail,
  type GitLabProject,
  type GitLabTreeEntry,
} from "../gitlab/client"
import {
  type ChangesetData,
  emptyChangeset,
  loadChangeset,
  saveChangeset,
} from "../model/changeset"
import { type Workspace, resolveWorkspace } from "../model/workspace"

export function useStudioLocation(config: StudioConfig) {
  const [location, setLocationState] = useState<StudioLocation>(() =>
    parseLocation(window.location.search, config),
  )
  useEffect(() => {
    const onPop = () =>
      setLocationState(parseLocation(window.location.search, config))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [config])
  const setLocation = useCallback(
    (patch: Partial<StudioLocation>, push = true) => {
      setLocationState((current) => {
        const next = { ...current, ...patch }
        const search = buildLocationSearch(next, config)
        const url = `${window.location.pathname}${search}`
        if (push) window.history.pushState(null, "", url)
        else window.history.replaceState(null, "", url)
        return next
      })
    },
    [config],
  )
  return [location, setLocation] as const
}

export function useAuthSession(config: StudioConfig) {
  const session = useMemo(() => {
    const appId = config.gitlab.appId
    return new AuthSession(
      appId
        ? {
            baseUrl: config.gitlab.baseUrl,
            appId,
            redirectUri: `${window.location.origin}${config.editPath}`,
          }
        : null,
    )
  }, [config])
  const signedIn = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.isSignedIn,
  )
  return { session, signedIn }
}

export function useGitLabClient(session: AuthSession, config: StudioConfig) {
  return useMemo(
    () =>
      new GitLabClient({
        baseUrl: config.gitlab.baseUrl,
        getToken: () => session.getAccessToken().catch(() => null),
        onUnauthorized: () =>
          session
            .forceRefresh()
            .then((tokens) => tokens.accessToken)
            .catch(() => null),
      }),
    [session, config],
  )
}

export interface AsyncState<T> {
  status: "idle" | "loading" | "ready" | "error"
  data: T | null
  error: Error | null
  reload: () => void
}

export function useAsync<T>(
  task: (() => Promise<T>) | null,
  deps: unknown[],
): AsyncState<T> {
  const [state, setState] = useState<Omit<AsyncState<T>, "reload">>({
    status: task ? "loading" : "idle",
    data: null,
    error: null,
  })
  const [nonce, setNonce] = useState(0)
  const taskRef = useRef(task)
  taskRef.current = task
  useEffect(() => {
    const current = taskRef.current
    if (!current) {
      setState({ status: "idle", data: null, error: null })
      return
    }
    let cancelled = false
    setState((previous) => ({ ...previous, status: "loading", error: null }))
    current().then(
      (data) => {
        if (!cancelled) setState({ status: "ready", data, error: null })
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}

export function useWorkspace(
  client: GitLabClient,
  config: StudioConfig,
  location: StudioLocation,
  signedIn: boolean,
): AsyncState<Workspace> {
  return useAsync(
    () => resolveWorkspace(client, config, location, signedIn),
    [client, config, location.project, signedIn],
  )
}

export interface TreeFile {
  file: string
  repoPath: string
  kind: "markdown" | "image" | "other"
}

export function useTree(
  client: GitLabClient,
  projectId: number | null,
  branch: string,
  config: StudioConfig,
): AsyncState<TreeFile[]> {
  return useAsync(
    projectId === null
      ? null
      : async () => {
          const roots = [
            ...config.contentRoots,
            joinPath(config.staticRoot, "img"),
          ]
          const entries: GitLabTreeEntry[] = []
          for (const root of roots) {
            try {
              entries.push(
                ...(await client.listTree(
                  projectId,
                  branch,
                  joinPath(config.docsRoot, root),
                )),
              )
            } catch {
              continue
            }
          }
          const prefix = `${config.docsRoot}/`
          return entries
            .filter((entry) => entry.type === "blob")
            .map((entry) => ({
              file: entry.path.slice(prefix.length),
              repoPath: entry.path,
              kind: isMarkdownFile(entry.path)
                ? ("markdown" as const)
                : isImageFile(entry.path)
                  ? ("image" as const)
                  : ("other" as const),
            }))
            .sort((a, b) => a.file.localeCompare(b.file))
        },
    [client, projectId, branch, config],
  )
}

export function useDraft(projectId: number | null, branch: string) {
  const [draft, setDraft] = useState<ChangesetData | null>(null)
  useEffect(() => {
    if (projectId === null) {
      setDraft(null)
      return
    }
    setDraft(
      loadChangeset(projectId, branch) ??
        emptyChangeset(projectId, branch, null),
    )
  }, [projectId, branch])
  const update = useCallback(
    (updater: (current: ChangesetData) => ChangesetData) => {
      setDraft((current) => {
        if (!current) return current
        const next = updater(current)
        scheduleSave(next)
        return next
      })
    },
    [],
  )
  return [draft, update] as const
}

let pendingSave: ChangesetData | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function flushSave() {
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = null
  if (pendingSave) saveChangeset(pendingSave)
  pendingSave = null
}

function scheduleSave(data: ChangesetData) {
  if (
    pendingSave &&
    (pendingSave.projectId !== data.projectId ||
      pendingSave.branch !== data.branch)
  ) {
    flushSave()
  }
  pendingSave = data
  if (saveTimer === null) saveTimer = setTimeout(flushSave, 400)
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushSave)
  window.addEventListener("beforeunload", flushSave)
}

export interface RemoteFile {
  content: string
  lastCommitId: string
}

const remoteFileCache = new Map<string, Promise<RemoteFile | null>>()

export function invalidateRemoteFiles() {
  remoteFileCache.clear()
}

export function fetchRemoteFile(
  client: GitLabClient,
  projectId: number,
  branch: string,
  repoPath: string,
): Promise<RemoteFile | null> {
  const key = `${projectId}:${branch}:${repoPath}`
  let pending = remoteFileCache.get(key)
  if (pending === undefined) {
    pending = client
      .getFile(projectId, branch, repoPath)
      .then((file) => ({
        content: file.content,
        lastCommitId: file.lastCommitId,
      }))
      .catch((error: unknown) => {
        if ((error as { status?: number }).status === 404) return null
        remoteFileCache.delete(key)
        throw error
      })
    remoteFileCache.set(key, pending)
  }
  return pending
}

export function useRemoteFile(
  client: GitLabClient,
  projectId: number | null,
  branch: string,
  repoPath: string | null,
): AsyncState<RemoteFile | null> {
  return useAsync(
    projectId === null || repoPath === null
      ? null
      : () => fetchRemoteFile(client, projectId, branch, repoPath),
    [client, projectId, branch, repoPath],
  )
}

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])
  return debounced
}

export function describeError(error: unknown): string {
  if (error instanceof GitLabError) {
    if (error.status === 429) {
      return "GitLab is rate limiting requests from this browser. Sign in to raise the limit, or wait a minute."
    }
    if (error.status === 401)
      return "Your GitLab session expired. Sign in again."
    if (error.status === 403)
      return "GitLab refused this request. You may not have access to this project."
    if (error.status === 404) return "Not found on GitLab."
  }
  return error instanceof Error ? error.message : String(error)
}

export function useMergeRequest(
  client: GitLabClient,
  upstream: GitLabProject | null,
  source: GitLabProject | null,
  branch: string,
  enabled: boolean,
): AsyncState<GitLabMergeRequestDetail | null> {
  return useAsync(
    !enabled || !upstream || !source
      ? null
      : async () => {
          const list = await client.listMergeRequests(upstream.id, {
            source_branch: branch,
            state: "opened",
          })
          const match =
            list.find((mr) => mr.source_project_id === source.id) ?? null
          if (!match) return null
          return client.getMergeRequest(upstream.id, match.iid)
        },
    [client, upstream?.id, source?.id, branch, enabled],
  )
}
