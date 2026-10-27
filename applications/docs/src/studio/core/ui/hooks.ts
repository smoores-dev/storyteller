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
  type GitLabBranch,
  GitLabClient,
  GitLabError,
  type GitLabMergeRequestDetail,
  type GitLabProject,
  type GitLabTreeEntry,
  RateLimitError,
} from "../gitlab/client"
import { sharedRateLimitMonitor } from "../gitlab/rateLimit"
import type { ChangesetData } from "../model/changeset"
import { type Workspace, resolveWorkspace } from "../model/workspace"
import { cacheGet, cachePut, cached } from "../storage/cache"
import { draftPersistence } from "../storage/drafts"

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
        monitor: sharedRateLimitMonitor(config.hourlyRequestLimit ?? 5000),
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
  blobId: string
}

interface LoadedTree {
  files: TreeFile[]
  roots: string[]
}

const knownBlobs = new Map<string, string>()
const knownHeads = new Map<string, string>()
const knownTrees = new Map<string, { roots: string[]; paths: Set<string> }>()

function treeKey(projectId: number, branch: string) {
  return `${projectId}:${branch}`
}

function rememberTree(projectId: number, branch: string, tree: LoadedTree) {
  const prefix = `${treeKey(projectId, branch)}:`
  for (const key of [...knownBlobs.keys()]) {
    if (key.startsWith(prefix)) knownBlobs.delete(key)
  }
  for (const file of tree.files) {
    knownBlobs.set(`${prefix}${file.repoPath}`, file.blobId)
  }
  knownTrees.set(treeKey(projectId, branch), {
    roots: tree.roots,
    paths: new Set(tree.files.map((file) => file.repoPath)),
  })
}

export function isKnownAbsent(
  projectId: number,
  branch: string,
  repoPath: string,
): boolean {
  const tree = knownTrees.get(treeKey(projectId, branch))
  if (!tree) return false
  const covered = tree.roots.some(
    (root) => repoPath === root || repoPath.startsWith(`${root}/`),
  )
  return covered && !tree.paths.has(repoPath)
}

export function useTree(
  client: GitLabClient,
  projectId: number | null,
  branch: string,
  config: StudioConfig,
  headSha: string | null | undefined,
): AsyncState<TreeFile[]> {
  return useAsync(
    projectId === null || headSha === undefined
      ? null
      : async () => {
          const roots = [
            ...config.contentRoots,
            joinPath(config.staticRoot, "img"),
          ].map((root) => joinPath(config.docsRoot, root))
          const key = headSha
            ? `tree:${projectId}:${headSha}:${roots.join(",")}`
            : null
          const loaded = await cached<LoadedTree>(key, async () => {
            const entries: GitLabTreeEntry[] = []
            const listed: string[] = []
            for (const root of roots) {
              try {
                entries.push(
                  ...(await client.listTree(projectId, branch, root)),
                )
                listed.push(root)
              } catch (error) {
                if (error instanceof GitLabError && error.status === 404) {
                  listed.push(root)
                  continue
                }
                throw error
              }
            }
            const prefix = `${config.docsRoot}/`
            return {
              roots: listed,
              files: entries
                .filter((entry) => entry.type === "blob")
                .map((entry) => ({
                  file: entry.path.slice(prefix.length),
                  repoPath: entry.path,
                  blobId: entry.id,
                  kind: isMarkdownFile(entry.path)
                    ? ("markdown" as const)
                    : isImageFile(entry.path)
                      ? ("image" as const)
                      : ("other" as const),
                }))
                .sort((a, b) => a.file.localeCompare(b.file)),
            }
          })
          rememberTree(projectId, branch, loaded)
          return loaded.files
        },
    [client, projectId, branch, config, headSha],
  )
}

export function useDraft(projectId: number | null, branch: string) {
  const persistence = draftPersistence()
  const [draft, setDraft] = useState<ChangesetData | null>(null)
  useEffect(() => {
    if (projectId === null) {
      setDraft(null)
      return
    }
    let cancelled = false
    setDraft(null)
    void persistence.load(projectId, branch).then((data) => {
      if (!cancelled) setDraft(data)
    })
    return () => {
      cancelled = true
      void persistence.flush()
    }
  }, [projectId, branch, persistence])
  const update = useCallback(
    (updater: (current: ChangesetData) => ChangesetData) => {
      setDraft((current) => {
        if (!current) return current
        const next = updater(current)
        if (next !== current) persistence.schedule(next)
        return next
      })
    },
    [persistence],
  )
  return [draft, update] as const
}

export function useSaveState() {
  const persistence = draftPersistence()
  return useSyncExternalStore(
    persistence.subscribe,
    persistence.getState,
    persistence.getState,
  )
}

export function useRateLimit(config: StudioConfig) {
  const monitor = sharedRateLimitMonitor(config.hourlyRequestLimit ?? 5000)
  return useSyncExternalStore(
    monitor.subscribe,
    monitor.getSnapshot,
    monitor.getSnapshot,
  )
}

export interface RemoteFile {
  content: string
  lastCommitId: string
}

const remoteFileCache = new Map<string, Promise<RemoteFile | null>>()
const branchCache = new Map<string, Promise<GitLabBranch | null>>()

export function invalidateRemoteFiles() {
  remoteFileCache.clear()
  branchCache.clear()
  knownBlobs.clear()
  knownTrees.clear()
  knownHeads.clear()
}

export function fetchBranch(
  client: GitLabClient,
  projectId: number,
  name: string,
): Promise<GitLabBranch | null> {
  const key = `${projectId}:${name}`
  let pending = branchCache.get(key)
  if (pending === undefined) {
    pending = client
      .getBranch(projectId, name)
      .then((branch) => {
        if (branch) knownHeads.set(key, branch.commit.id)
        return branch
      })
      .catch((error: unknown) => {
        branchCache.delete(key)
        throw error
      })
    branchCache.set(key, pending)
  }
  return pending
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
    if (isKnownAbsent(projectId, branch, repoPath)) return Promise.resolve(null)
    pending = (async () => {
      const blobId = knownBlobs.get(key)
      const head = knownHeads.get(`${projectId}:${branch}`)
      const lookups = [
        blobId ? `file:${projectId}:${blobId}` : null,
        head ? `file:${projectId}:${head}:${repoPath}` : null,
      ].filter((lookup): lookup is string => lookup !== null)
      for (const lookup of lookups) {
        const hit = await cacheGet<RemoteFile>(lookup)
        if (hit) return hit
      }
      const file = await client.getFile(projectId, branch, repoPath)
      const remote = { content: file.content, lastCommitId: file.lastCommitId }
      void cachePut(`file:${projectId}:${file.blobId}`, remote)
      if (head) void cachePut(`file:${projectId}:${head}:${repoPath}`, remote)
      return remote
    })().catch((error: unknown) => {
      if ((error as { status?: number }).status === 404) return null
      remoteFileCache.delete(key)
      throw error
    })
    remoteFileCache.set(key, pending)
  }
  return pending
}

export function knownBlobId(
  projectId: number,
  branch: string,
  repoPath: string,
): string | null {
  return knownBlobs.get(`${projectId}:${branch}:${repoPath}`) ?? null
}

export function useRemoteFile(
  client: GitLabClient,
  projectId: number | null,
  branch: string,
  repoPath: string | null,
  headSha: string | null | undefined,
): AsyncState<RemoteFile | null> {
  return useAsync(
    projectId === null || repoPath === null || headSha === undefined
      ? null
      : () => fetchRemoteFile(client, projectId, branch, repoPath),
    [client, projectId, branch, repoPath, headSha],
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
  if (error instanceof RateLimitError) {
    const when = error.resetAt
      ? new Date(error.resetAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null
    return when
      ? `GitLab is rate limiting requests. Everything works again around ${when}. Your drafts are safe.`
      : "GitLab is rate limiting requests. Wait a minute and try again. Your drafts are safe."
  }
  if (error instanceof GitLabError) {
    if (error.status === 0) return error.message
    if (error.status === 401)
      return "Your GitLab session expired. Sign in again."
    if (error.status === 403)
      return "GitLab refused this request. You may not have access to this project."
    if (error.status === 404) {
      return error.request.path
        ? `Not found on GitLab: ${decodeURIComponent(error.request.path)}`
        : "Not found on GitLab."
    }
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export function errorDetails(error: unknown): string {
  const lines: string[] = [
    `time: ${new Date().toISOString()}`,
    `page: ${typeof window === "undefined" ? "" : window.location.href}`,
  ]
  if (error instanceof GitLabError) {
    lines.push(
      `status: ${error.status}`,
      `request: ${error.request.method} ${decodeURIComponent(error.request.path)}`,
      `message: ${error.message}`,
    )
    if (error.body && typeof error.body === "object") {
      lines.push(`body: ${JSON.stringify(error.body)}`)
    }
  } else if (error instanceof Error) {
    lines.push(`error: ${error.name}: ${error.message}`)
  } else {
    lines.push(`error: ${String(error)}`)
  }
  return lines.join("\n")
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
