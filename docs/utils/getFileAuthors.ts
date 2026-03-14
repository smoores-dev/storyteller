import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { type Contributor, gitLabContributors } from "./gitlabContributors"

const GITLAB_PROJECT_URL = "https://gitlab.com/storyteller-platform/storyteller"

const execFilePromise = promisify(execFile)

type GitLog = {
  name: string
  email: string
  date: string
  commitHash: string
}

export type Author = Contributor & {
  commitDate: string
  commitUrl: string
}

async function getFileGitLogs(filePath: string): Promise<GitLog[]> {
  try {
    const { stdout } = await execFilePromise("git", [
      "log",
      "--format=%an|%ae|%aI|%H",
      "--follow",
      "--",
      filePath,
    ])

    if (!stdout.trim()) {
      throw new Error(`No git log output from file: ${filePath}`)
    }

    const gitLogs: GitLog[] = []

    for (const line of stdout.split("\n").filter(Boolean)) {
      const [name, email, date, commitHash] = line.split("|")
      gitLogs.push({
        name,
        email,
        date,
        commitHash,
      })
    }

    return gitLogs
  } catch (error) {
    throw new Error(`Failed to get git logs for file: ${filePath}: ${error}`)
  }
}

export async function getFileAuthors(filePath: string): Promise<Author[]> {
  const gitLogs: GitLog[] = await getFileGitLogs(filePath)

  const contributors: Contributor[] = await gitLabContributors
  const authors: Author[] = []

  for (const gitLog of gitLogs) {
    // Match git commit emails to contributor profiles to get avatar/username
    const matchingContributor = contributors.find((contributor) =>
      contributor.emails?.some(
        (email) => email.toLowerCase() === gitLog.email.toLowerCase(),
      ),
    )

    // Deduplicate by username so there are no duplicate authors
    if (
      matchingContributor &&
      !authors.some(
        (author) => author.username === matchingContributor.username,
      )
    ) {
      authors.push({
        ...matchingContributor,
        commitDate: gitLog.date,
        commitUrl: `${GITLAB_PROJECT_URL}/-/commit/${gitLog.commitHash}`,
      })
    }
  }

  // Sort by most recent commit first
  authors.sort(
    (a, b) =>
      new Date(b.commitDate).getTime() - new Date(a.commitDate).getTime(),
  )

  return authors
}
