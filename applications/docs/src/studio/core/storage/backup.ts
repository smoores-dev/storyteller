import { fileToBase64 } from "../images/naming"
import type { ChangesetData } from "../model/changeset"

import { fromLegacyDraft } from "./drafts"
import { type ZipEntry, buildZip } from "./zip"

export const BACKUP_FORMAT = "docs-studio-draft"

interface BackupChange {
  kind: string
  base64?: string
  [key: string]: unknown
}

export async function exportDraft(data: ChangesetData): Promise<string> {
  const changes: Record<string, BackupChange> = {}
  for (const [path, change] of Object.entries(data.changes)) {
    if (change.kind === "binary") {
      changes[path] = {
        kind: "binary",
        mime: change.mime,
        base: change.base,
        base64: await fileToBase64(change.blob),
      }
    } else {
      changes[path] = change
    }
  }

  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    projectId: data.projectId,
    branch: data.branch,
    changes,
  })
}

export function importDraft(
  text: string,
  projectId: number,
  branch: string,
): ChangesetData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("That file is not a docs studio backup.")
  }

  const record = unwrap(parsed)
  const data = fromLegacyDraft(record, projectId, branch)
  if (!data || Object.keys(data.changes).length === 0) {
    throw new Error("That backup does not contain any changes.")
  }

  return data
}

function unwrap(parsed: unknown): unknown {
  if (parsed && typeof parsed === "object" && "draft" in parsed) {
    return (parsed as { draft: unknown }).draft
  }

  return parsed
}

export function mergeDraft(
  current: ChangesetData,
  incoming: ChangesetData,
): ChangesetData {
  return {
    ...current,
    changes: { ...current.changes, ...incoming.changes },
  }
}

function fileStamp(now: Date) {
  return now.toISOString().slice(0, 16).replace(/[:T]/g, "-")
}

function branchSlug(branch: string) {
  return branch.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "draft"
}

export function backupFileName(branch: string, now = new Date()): string {
  return `docs-studio-${branchSlug(branch)}-${fileStamp(now)}.json`
}

export function zipFileName(branch: string, now = new Date()): string {
  return `docs-studio-${branchSlug(branch)}-${fileStamp(now)}.zip`
}

export async function exportChangesZip(
  data: ChangesetData,
  now = new Date(),
): Promise<Blob> {
  const encoder = new TextEncoder()
  const entries: ZipEntry[] = []
  const lines: string[] = []
  for (const [path, change] of Object.entries(data.changes).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (change.kind === "text") {
      entries.push({
        path: `files/${path}`,
        data: encoder.encode(change.content),
      })
      lines.push(
        `${change.base.lastCommitId === null ? "new     " : "edited  "} ${path}`,
      )
    } else if (change.kind === "binary") {
      entries.push({
        path: `files/${path}`,
        data: new Uint8Array(await change.blob.arrayBuffer()),
      })
      lines.push(
        `${change.base.lastCommitId === null ? "new     " : "replaced"} ${path}`,
      )
    } else if (change.kind === "move") {
      if (change.content !== null) {
        entries.push({
          path: `files/${path}`,
          data: encoder.encode(change.content),
        })
      }

      lines.push(
        `moved    ${change.from} -> ${path}${change.content === null ? " (unchanged, so not included here)" : ""}`,
      )
    } else {
      lines.push(`deleted  ${path}`)
    }
  }

  const readme = [
    "Docs studio export",
    "",
    `Branch:    ${data.branch}`,
    `Exported:  ${now.toISOString()}`,
    `Based on:  ${data.headSha ?? "unknown"}`,
    `Files:     ${entries.length} in this zip, ${lines.length} changes in total`,
    "",
    "The files folder mirrors the repository. Copy its contents over a checkout",
    "of the branch to get your work back, or paste the text into the studio.",
    "Deleted files are only listed below, nothing is saved for them.",
    "",
    "Changes",
    ...lines,
    "",
  ].join("\n")
  return buildZip(
    [{ path: "README.txt", data: encoder.encode(readme) }, ...entries],
    now,
  )
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadText(name: string, text: string) {
  downloadBlob(name, new Blob([text], { type: "application/json" }))
}
