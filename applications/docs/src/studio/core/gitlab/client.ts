import type { BlameChunk } from "../editor/blame"

export interface GitLabUser {
  id: number
  username: string
  name: string
  avatar_url: string | null
  web_url: string
}

export interface GitLabProject {
  id: number
  path_with_namespace: string
  name: string
  default_branch: string
  web_url: string
  visibility: "public" | "internal" | "private"
  import_status?: string
  forked_from_project?: { id: number; path_with_namespace: string }
  permissions?: {
    project_access: { access_level: number } | null
    group_access: { access_level: number } | null
  }
  namespace: { id: number; path: string; kind: string }
}

export interface GitLabBranch {
  name: string
  default: boolean
  protected: boolean
  web_url: string
  commit: {
    id: string
    short_id: string
    title: string
    committed_date: string
    author_name: string
  }
}

export interface GitLabTreeEntry {
  id: string
  name: string
  type: "tree" | "blob"
  path: string
  mode: string
}

export interface GitLabFile {
  file_name: string
  file_path: string
  size: number
  encoding: "base64"
  content: string
  content_sha256: string
  ref: string
  blob_id: string
  commit_id: string
  last_commit_id: string
}

export interface GitLabCommit {
  id: string
  short_id: string
  title: string
  message: string
  author_name: string
  authored_date: string
  committed_date: string
  web_url: string
  parent_ids: string[]
}

export interface GitLabDiff {
  old_path: string
  new_path: string
  diff: string
  new_file: boolean
  renamed_file: boolean
  deleted_file: boolean
}

export interface GitLabCompare {
  commit: GitLabCommit | null
  commits: GitLabCommit[]
  diffs: GitLabDiff[]
  compare_timeout: boolean
  compare_same_ref: boolean
  web_url: string
}

export interface GitLabMergeRequest {
  iid: number
  title: string
  state: string
  web_url: string
  draft: boolean
  source_branch: string
  target_branch: string
  source_project_id: number
  target_project_id: number
}

export type PipelineStatus =
  | "created"
  | "waiting_for_resource"
  | "preparing"
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "canceled"
  | "skipped"
  | "manual"
  | "scheduled"

export interface GitLabPipeline {
  id: number
  status: PipelineStatus
  web_url: string
}

export interface GitLabMergeRequestDetail extends GitLabMergeRequest {
  head_pipeline: GitLabPipeline | null
  detailed_merge_status?: string
  has_conflicts?: boolean
  merge_status?: string
  changes_count?: string
  diff_refs?: { base_sha: string; head_sha: string; start_sha: string } | null
}

export interface GitLabNotePosition {
  position_type: "text" | "image" | "file"
  new_path: string | null
  old_path: string | null
  new_line: number | null
  old_line: number | null
}

export interface GitLabNote {
  id: number
  body: string
  author: GitLabUser
  created_at: string
  system: boolean
  resolvable: boolean
  resolved?: boolean
  position?: GitLabNotePosition
}

export interface GitLabDiscussion {
  id: string
  individual_note: boolean
  notes: GitLabNote[]
}

export type CommitAction =
  | {
      action: "create" | "update"
      file_path: string
      content: string
      encoding?: "text" | "base64"
      last_commit_id?: string
    }
  | { action: "delete"; file_path: string; last_commit_id?: string }
  | {
      action: "move"
      file_path: string
      previous_path: string
      content?: string
      encoding?: "text" | "base64"
      last_commit_id?: string
    }

export interface CommitPayload {
  branch: string
  commit_message: string
  start_branch?: string
  start_project?: number
  actions: CommitAction[]
}

export class GitLabError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
  }
}

interface ClientOptions {
  baseUrl: string
  getToken: () => Promise<string | null>
  onUnauthorized?: () => Promise<string | null>
}

type Query = Record<string, string | number | boolean | undefined>

function encodePath(path: string) {
  return encodeURIComponent(path)
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\n/g, ""))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export class GitLabClient {
  constructor(private readonly options: ClientOptions) {}

  get baseUrl() {
    return this.options.baseUrl
  }

  private async fetch(
    path: string,
    init: RequestInit & { query?: Query } = {},
    retry = true,
  ): Promise<Response> {
    const url = new URL(`${this.options.baseUrl}/api/v4${path}`)
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    const headers = new Headers(init.headers)
    const token = await this.options.getToken()
    if (token) headers.set("authorization", `Bearer ${token}`)
    if (init.body && !(init.body instanceof FormData)) {
      headers.set("content-type", "application/json")
    }
    const response = await fetch(url, { ...init, headers })
    if (
      response.status === 401 &&
      retry &&
      token &&
      this.options.onUnauthorized
    ) {
      const refreshed = await this.options.onUnauthorized()
      if (refreshed) return this.fetch(path, init, false)
    }
    if (!response.ok) {
      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        body = await response.text().catch(() => null)
      }
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? JSON.stringify((body as { message: unknown }).message)
          : `${response.status} ${response.statusText}`
      throw new GitLabError(message, response.status, body)
    }
    return response
  }

  private async json<T>(
    path: string,
    init: RequestInit & { query?: Query } = {},
  ): Promise<T> {
    const response = await this.fetch(path, init)
    return (await response.json()) as T
  }

  private async paginated<T>(path: string, query: Query = {}): Promise<T[]> {
    const results: T[] = []
    let page = 1
    for (;;) {
      const response = await this.fetch(path, {
        query: { ...query, per_page: 100, page },
      })
      results.push(...((await response.json()) as T[]))
      const next = response.headers.get("x-next-page")
      if (!next) break
      page = Number(next)
    }
    return results
  }

  getCurrentUser() {
    return this.json<GitLabUser>("/user")
  }

  getProject(idOrPath: number | string) {
    return this.json<GitLabProject>(`/projects/${encodePath(String(idOrPath))}`)
  }

  listOwnForks(projectId: number) {
    return this.paginated<GitLabProject>(`/projects/${projectId}/forks`, {
      owned: true,
    })
  }

  createFork(projectId: number) {
    return this.json<GitLabProject>(`/projects/${projectId}/fork`, {
      method: "POST",
      body: JSON.stringify({}),
    })
  }

  listBranches(projectId: number, search?: string) {
    return this.paginated<GitLabBranch>(
      `/projects/${projectId}/repository/branches`,
      { search },
    )
  }

  async getBranch(projectId: number, name: string) {
    try {
      return await this.json<GitLabBranch>(
        `/projects/${projectId}/repository/branches/${encodePath(name)}`,
      )
    } catch (error) {
      if (error instanceof GitLabError && error.status === 404) return null
      throw error
    }
  }

  createBranch(projectId: number, name: string, ref: string) {
    return this.json<GitLabBranch>(
      `/projects/${projectId}/repository/branches`,
      {
        method: "POST",
        body: JSON.stringify({ branch: name, ref }),
      },
    )
  }

  listTree(projectId: number, ref: string, path: string, recursive = true) {
    return this.paginated<GitLabTreeEntry>(
      `/projects/${projectId}/repository/tree`,
      { ref, path, recursive },
    )
  }

  async getFile(projectId: number, ref: string, path: string) {
    const file = await this.json<GitLabFile>(
      `/projects/${projectId}/repository/files/${encodePath(path)}`,
      { query: { ref } },
    )
    return {
      path: file.file_path,
      content: decodeBase64Utf8(file.content),
      lastCommitId: file.last_commit_id,
      blobId: file.blob_id,
      size: file.size,
    }
  }

  async fileExists(projectId: number, ref: string, path: string) {
    try {
      await this.fetch(
        `/projects/${projectId}/repository/files/${encodePath(path)}`,
        { method: "HEAD", query: { ref } },
      )
      return true
    } catch (error) {
      if (error instanceof GitLabError && error.status === 404) return false
      throw error
    }
  }

  async getRawBlob(projectId: number, ref: string, path: string) {
    const response = await this.fetch(
      `/projects/${projectId}/repository/files/${encodePath(path)}/raw`,
      { query: { ref } },
    )
    return response.blob()
  }

  async getRawText(projectId: number, ref: string, path: string) {
    const response = await this.fetch(
      `/projects/${projectId}/repository/files/${encodePath(path)}/raw`,
      { query: { ref } },
    )
    return response.text()
  }

  commit(projectId: number, payload: CommitPayload) {
    return this.json<GitLabCommit>(
      `/projects/${projectId}/repository/commits`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    )
  }

  listCommits(projectId: number, ref: string, path?: string, perPage = 50) {
    return this.json<GitLabCommit[]>(
      `/projects/${projectId}/repository/commits`,
      {
        query: { ref_name: ref, path, per_page: perPage },
      },
    )
  }

  compare(projectId: number, from: string, to: string, fromProjectId?: number) {
    return this.json<GitLabCompare>(
      `/projects/${projectId}/repository/compare`,
      {
        query: { from, to, from_project_id: fromProjectId, straight: false },
      },
    )
  }

  getMergeRequest(projectId: number, iid: number) {
    return this.json<GitLabMergeRequestDetail>(
      `/projects/${projectId}/merge_requests/${iid}`,
    )
  }

  listMergeRequestDiffs(projectId: number, iid: number) {
    return this.paginated<GitLabDiff>(
      `/projects/${projectId}/merge_requests/${iid}/diffs`,
    )
  }

  listDiscussions(projectId: number, iid: number) {
    return this.paginated<GitLabDiscussion>(
      `/projects/${projectId}/merge_requests/${iid}/discussions`,
    )
  }

  createDiscussion(
    projectId: number,
    iid: number,
    body: string,
    position?: GitLabNotePosition & {
      base_sha: string
      head_sha: string
      start_sha: string
    },
  ) {
    return this.json<GitLabDiscussion>(
      `/projects/${projectId}/merge_requests/${iid}/discussions`,
      {
        method: "POST",
        body: JSON.stringify(position ? { body, position } : { body }),
      },
    )
  }

  replyToDiscussion(
    projectId: number,
    iid: number,
    discussionId: string,
    body: string,
  ) {
    return this.json<GitLabNote>(
      `/projects/${projectId}/merge_requests/${iid}/discussions/${discussionId}/notes`,
      { method: "POST", body: JSON.stringify({ body }) },
    )
  }

  resolveDiscussion(
    projectId: number,
    iid: number,
    discussionId: string,
    resolved: boolean,
  ) {
    return this.json<GitLabDiscussion>(
      `/projects/${projectId}/merge_requests/${iid}/discussions/${discussionId}`,
      { method: "PUT", body: JSON.stringify({ resolved }) },
    )
  }

  commitTags(projectId: number, sha: string) {
    return this.json<{ type: string; name: string }[]>(
      `/projects/${projectId}/repository/commits/${sha}/refs`,
      { query: { type: "tag" } },
    )
  }

  blame(projectId: number, ref: string, path: string) {
    return this.json<BlameChunk[]>(
      `/projects/${projectId}/repository/files/${encodePath(path)}/blame`,
      { query: { ref } },
    )
  }

  async lastCommitFor(projectId: number, ref: string, path: string) {
    const commits = await this.listCommits(projectId, ref, path, 1)
    return commits[0]?.id ?? null
  }

  listMergeRequests(
    projectId: number,
    query: { source_branch?: string; state?: string },
  ) {
    return this.json<GitLabMergeRequest[]>(
      `/projects/${projectId}/merge_requests`,
      {
        query: { ...query, per_page: 20 },
      },
    )
  }

  createMergeRequest(
    projectId: number,
    payload: {
      source_branch: string
      target_branch: string
      target_project_id?: number
      title: string
      description?: string
      remove_source_branch?: boolean
    },
  ) {
    return this.json<GitLabMergeRequest>(
      `/projects/${projectId}/merge_requests`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    )
  }
}

export function accessLevel(project: GitLabProject): number {
  const permissions = project.permissions
  if (!permissions) return 0
  return Math.max(
    permissions.project_access?.access_level ?? 0,
    permissions.group_access?.access_level ?? 0,
  )
}

export const DEVELOPER_ACCESS = 30
