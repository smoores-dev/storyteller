import type { CommitAction } from "../gitlab/client"

export interface BaseFile {
  content: string | null
  lastCommitId: string | null
}

export type Change =
  | { kind: "text"; content: string; base: BaseFile }
  | { kind: "binary"; base64: string; mime: string; base: BaseFile }
  | { kind: "delete"; base: BaseFile }
  | { kind: "move"; from: string; content: string | null; base: BaseFile }

export interface ChangesetData {
  version: 1
  projectId: number
  branch: string
  headSha: string | null
  createdAt: number
  changes: Record<string, Change>
}

export const MISSING_BASE: BaseFile = { content: null, lastCommitId: null }

export function changesetKey(projectId: number, branch: string) {
  return `studio:draft:${projectId}:${branch}`
}

export function emptyChangeset(
  projectId: number,
  branch: string,
  headSha: string | null,
): ChangesetData {
  return {
    version: 1,
    projectId,
    branch,
    headSha,
    createdAt: Date.now(),
    changes: {},
  }
}

export function loadChangeset(
  projectId: number,
  branch: string,
): ChangesetData | null {
  try {
    const raw = localStorage.getItem(changesetKey(projectId, branch))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ChangesetData
    return parsed.version === 1 ? parsed : null
  } catch {
    return null
  }
}

export function saveChangeset(data: ChangesetData) {
  const key = changesetKey(data.projectId, data.branch)
  if (Object.keys(data.changes).length === 0) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify(data))
}

export function listDraftKeys(): { projectId: number; branch: string }[] {
  const drafts: { projectId: number; branch: string }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    const match = key?.match(/^studio:draft:(\d+):(.+)$/)
    if (match) drafts.push({ projectId: Number(match[1]), branch: match[2]! })
  }
  return drafts
}

export function withTextChange(
  data: ChangesetData,
  path: string,
  content: string,
  base: BaseFile,
): ChangesetData {
  const changes = { ...data.changes }
  const existing = changes[path]
  if (existing?.kind === "move") {
    changes[path] = { ...existing, content }
  } else if (base.content !== null && content === base.content) {
    delete changes[path]
  } else {
    changes[path] = { kind: "text", content, base }
  }
  return { ...data, changes }
}

export function withMove(
  data: ChangesetData,
  from: string,
  to: string,
  content: string | null,
  base: BaseFile,
): ChangesetData {
  const changes = { ...data.changes }
  const existing = changes[from]
  delete changes[from]
  if (existing?.kind === "text" && existing.base.lastCommitId === null) {
    changes[to] = { ...existing, content: content ?? existing.content }
    return { ...data, changes }
  }
  if (existing?.kind === "binary") {
    if (existing.base.lastCommitId !== null) {
      changes[from] = { kind: "delete", base: existing.base }
    }
    changes[to] = { ...existing, base: MISSING_BASE }
    return { ...data, changes }
  }
  const origin = existing?.kind === "move" ? existing.from : from
  const originBase = existing?.kind === "move" ? existing.base : base
  if (origin === to) {
    if (content !== null && content !== originBase.content) {
      changes[to] = { kind: "text", content, base: originBase }
    }
    return { ...data, changes }
  }
  changes[to] = { kind: "move", from: origin, content, base: originBase }
  return { ...data, changes }
}

export function withBinaryChange(
  data: ChangesetData,
  path: string,
  base64: string,
  mime: string,
  base: BaseFile = MISSING_BASE,
): ChangesetData {
  return {
    ...data,
    changes: {
      ...data.changes,
      [path]: { kind: "binary", base64, mime, base },
    },
  }
}

export function withDeletion(
  data: ChangesetData,
  path: string,
  base: BaseFile,
): ChangesetData {
  const changes = { ...data.changes }
  const existing = changes[path]
  if (existing?.kind === "move") {
    delete changes[path]
    changes[existing.from] = { kind: "delete", base: existing.base }
  } else if (base.lastCommitId === null) {
    delete changes[path]
  } else {
    changes[path] = { kind: "delete", base }
  }
  return { ...data, changes }
}

export function movedFromPaths(data: ChangesetData): string[] {
  return Object.values(data.changes).flatMap((change) =>
    change.kind === "move" ? [change.from] : [],
  )
}

export function withoutChange(
  data: ChangesetData,
  path: string,
): ChangesetData {
  const changes = { ...data.changes }
  delete changes[path]
  return { ...data, changes }
}

export function shapeOf(data: ChangesetData): string {
  return Object.keys(data.changes)
    .sort()
    .map((path) => {
      const change = data.changes[path]!
      const origin = change.kind === "move" ? change.from : ""
      const exists = change.base.lastCommitId === null ? "n" : "e"
      return `${path}\u0000${change.kind}\u0000${origin}\u0000${exists}`
    })
    .join("\n")
}

export function changedPaths(data: ChangesetData): string[] {
  return Object.keys(data.changes).sort()
}

export function isDirty(data: ChangesetData): boolean {
  return Object.keys(data.changes).length > 0
}

export function textOf(data: ChangesetData, path: string): string | null {
  const change = data.changes[path]
  if (change?.kind === "text") return change.content
  if (change?.kind === "move") return change.content
  return null
}

export function toCommitActions(data: ChangesetData): CommitAction[] {
  return changedPaths(data).map((path) => {
    const change = data.changes[path]!
    const exists = change.base.lastCommitId !== null
    if (change.kind === "delete") {
      return {
        action: "delete",
        file_path: path,
        last_commit_id: change.base.lastCommitId || undefined,
      }
    }
    if (change.kind === "move") {
      return {
        action: "move",
        file_path: path,
        previous_path: change.from,
        content: change.content ?? undefined,
        last_commit_id: change.base.lastCommitId || undefined,
      }
    }
    if (change.kind === "binary") {
      return {
        action: exists ? "update" : "create",
        file_path: path,
        content: change.base64,
        encoding: "base64",
        last_commit_id: change.base.lastCommitId || undefined,
      }
    }
    return {
      action: exists ? "update" : "create",
      file_path: path,
      content: change.content,
      last_commit_id: change.base.lastCommitId || undefined,
    }
  })
}

export function approximateSize(data: ChangesetData): number {
  let total = 0
  for (const change of Object.values(data.changes)) {
    if (change.kind === "text") total += change.content.length
    if (change.kind === "move") total += change.content?.length ?? 0
    if (change.kind === "binary") total += change.base64.length
  }
  return total
}
