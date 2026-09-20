import { isMarkdownFile } from "../config"
import type { GitLabClient } from "../gitlab/client"

import type { ChangesetData } from "./changeset"

export interface ConflictFile {
  repoPath: string
  mine: string | null
  theirs: string | null
  theirsCommit: string | null
  textual: boolean
}

export type ConflictDecision = "mine" | "theirs"

export async function findConflicts(
  client: GitLabClient,
  projectId: number,
  branch: string,
  data: ChangesetData,
): Promise<ConflictFile[]> {
  const conflicts: ConflictFile[] = []
  await Promise.all(
    Object.entries(data.changes).map(async ([repoPath, change]) => {
      if (!change.base.lastCommitId) return
      const trackedPath = change.kind === "move" ? change.from : repoPath
      const theirsCommit = await client
        .lastCommitFor(projectId, branch, trackedPath)
        .catch(() => null)
      if (theirsCommit === change.base.lastCommitId) return
      const textual = isMarkdownFile(trackedPath)
      let theirs: string | null = null
      if (theirsCommit !== null && textual) {
        theirs = await client
          .getFile(projectId, branch, trackedPath)
          .then((file) => file.content)
          .catch(() => null)
      }
      conflicts.push({
        repoPath,
        mine:
          change.kind === "text" || change.kind === "move"
            ? change.content
            : null,
        theirs,
        theirsCommit,
        textual,
      })
    }),
  )
  return conflicts.sort((a, b) => a.repoPath.localeCompare(b.repoPath))
}
