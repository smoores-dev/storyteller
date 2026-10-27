import type { CommitAction, GitLabClient } from "../gitlab/client"

export interface CommitProblem {
  path: string
  problem: string
}

export class CommitFailure extends Error {
  constructor(
    message: string,
    readonly problems: CommitProblem[],
    readonly reason: unknown,
    readonly actions: CommitAction[],
  ) {
    super(message)
  }
}

export function summarizeActions(actions: CommitAction[]): string {
  return actions
    .map((action) =>
      action.action === "move"
        ? `move ${action.previous_path} to ${action.file_path}`
        : `${action.action} ${action.file_path}`,
    )
    .join("\n")
}

export async function findProblems(
  client: GitLabClient,
  projectId: number,
  branch: string,
  actions: CommitAction[],
): Promise<CommitProblem[]> {
  const checks = actions.flatMap((action) => {
    if (action.action === "create") {
      return [{ path: action.file_path, expect: "absent" as const }]
    }

    if (action.action === "move") {
      return [
        { path: action.previous_path, expect: "present" as const },
        { path: action.file_path, expect: "absent" as const },
      ]
    }

    return [{ path: action.file_path, expect: "present" as const }]
  })
  const results = await Promise.all(
    checks.map(async (check) => ({
      check,
      exists: await client
        .fileExists(projectId, branch, check.path)
        .catch(() => null),
    })),
  )
  const problems: CommitProblem[] = []
  for (const { check, exists } of results) {
    if (exists === null) {
      continue
    }

    if (check.expect === "present" && !exists) {
      problems.push({
        path: check.path,
        problem: `does not exist on ${branch}, but the commit changes or removes it`,
      })
    }

    if (check.expect === "absent" && exists) {
      problems.push({
        path: check.path,
        problem: `already exists on ${branch}, but the commit tries to create it`,
      })
    }
  }

  return problems
}

export async function explainCommitFailure(
  client: GitLabClient,
  projectId: number,
  branch: string,
  actions: CommitAction[],
  reason: unknown,
): Promise<CommitFailure> {
  const problems = await findProblems(client, projectId, branch, actions)
  const raw = reason instanceof Error ? reason.message : String(reason)
  const message =
    problems.length > 0
      ? `GitLab refused the commit: ${raw}. ${problems.length === 1 ? "This file is the problem" : "These files are the problem"}:`
      : `GitLab refused the commit: ${raw}`
  return new CommitFailure(message, problems, reason, actions)
}
