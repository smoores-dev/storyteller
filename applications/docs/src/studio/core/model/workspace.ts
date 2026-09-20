import type { StudioConfig, StudioLocation } from "../config"
import {
  DEVELOPER_ACCESS,
  type GitLabClient,
  type GitLabProject,
  type GitLabUser,
  accessLevel,
} from "../gitlab/client"

export interface Workspace {
  upstream: GitLabProject
  explicit: GitLabProject | null
  user: GitLabUser | null
  canPushUpstream: boolean
  forks: GitLabProject[]
  fork: GitLabProject | null
}

function forkPreferenceKey(upstreamId: number) {
  return `studio:fork:${upstreamId}`
}

export function rememberFork(upstreamId: number, forkId: number) {
  try {
    localStorage.setItem(forkPreferenceKey(upstreamId), String(forkId))
  } catch {
    return
  }
}

function preferredFork(
  upstreamId: number,
  forks: GitLabProject[],
): GitLabProject | null {
  let remembered: number | null = null
  try {
    const raw = localStorage.getItem(forkPreferenceKey(upstreamId))
    remembered = raw ? Number(raw) : null
  } catch {
    remembered = null
  }
  return (
    forks.find((candidate) => candidate.id === remembered) ??
    forks.find((candidate) => candidate.namespace.kind === "user") ??
    forks[0] ??
    null
  )
}

export async function resolveWorkspace(
  client: GitLabClient,
  config: StudioConfig,
  location: StudioLocation,
  signedIn: boolean,
): Promise<Workspace> {
  const upstream = await client.getProject(config.gitlab.projectPath)
  const explicit =
    location.project && location.project !== upstream.path_with_namespace
      ? await client.getProject(location.project)
      : null
  if (!signedIn) {
    return {
      upstream,
      explicit,
      user: null,
      canPushUpstream: false,
      forks: [],
      fork: null,
    }
  }
  const user = await client.getCurrentUser()
  const canPushUpstream = accessLevel(upstream) >= DEVELOPER_ACCESS
  const forks = canPushUpstream ? [] : await client.listOwnForks(upstream.id)
  return {
    upstream,
    explicit,
    user,
    canPushUpstream,
    forks,
    fork: preferredFork(upstream.id, forks),
  }
}

export function writeProject(workspace: Workspace): GitLabProject | null {
  return workspace.canPushUpstream ? workspace.upstream : workspace.fork
}

export function branchProject(workspace: Workspace): GitLabProject {
  return workspace.explicit ?? writeProject(workspace) ?? workspace.upstream
}

export function readProject(
  workspace: Workspace,
  location: StudioLocation,
  config: StudioConfig,
): GitLabProject {
  if (workspace.explicit) return workspace.explicit
  if (location.branch === config.defaultBranch) return workspace.upstream
  return writeProject(workspace) ?? workspace.upstream
}

export async function ensureFork(
  client: GitLabClient,
  workspace: Workspace,
): Promise<GitLabProject> {
  if (workspace.fork) return workspace.fork
  let fork = await client.createFork(workspace.upstream.id)
  const deadline = Date.now() + 120_000
  while (
    fork.import_status &&
    fork.import_status !== "finished" &&
    fork.import_status !== "none"
  ) {
    if (Date.now() > deadline)
      throw new Error("The fork is still being created. Try again in a minute.")
    await new Promise((resolve) => setTimeout(resolve, 2000))
    fork = await client.getProject(fork.id)
  }
  rememberFork(workspace.upstream.id, fork.id)
  return fork
}

export type BranchCreation = "created" | "pending"

export async function createWorkBranch(
  client: GitLabClient,
  workspace: Workspace,
  target: GitLabProject,
  name: string,
  defaultBranch: string,
): Promise<BranchCreation> {
  if (target.id === workspace.upstream.id) {
    await client.createBranch(target.id, name, defaultBranch)
    return "created"
  }
  const [upstreamHead, forkHead] = await Promise.all([
    client.getBranch(workspace.upstream.id, defaultBranch),
    client.getBranch(target.id, target.default_branch),
  ])
  if (
    upstreamHead &&
    forkHead &&
    upstreamHead.commit.id === forkHead.commit.id
  ) {
    await client.createBranch(target.id, name, target.default_branch)
    return "created"
  }
  return "pending"
}

export function suggestBranchName(seed: string): string {
  const slug = seed
    .toLowerCase()
    .replace(/\.(md|mdx)$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return `docs/${slug || "update"}`
}

export function isValidBranchName(name: string, defaultBranch: string) {
  return (
    /^[^\s~^:?*[\\]+$/.test(name) &&
    !name.startsWith("-") &&
    !name.endsWith("/") &&
    !name.endsWith(".lock") &&
    !name.includes("..") &&
    name !== defaultBranch
  )
}
