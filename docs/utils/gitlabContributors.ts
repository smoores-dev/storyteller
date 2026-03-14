import { Client, fetchExchange, gql } from "@urql/core"
import { retryExchange } from "@urql/exchange-retry"

const GITLAB_GRAPHQL_ENDPOINT = "https://gitlab.com/api/graphql"

const client = new Client({
  url: GITLAB_GRAPHQL_ENDPOINT,
  // Use default retry options
  exchanges: [retryExchange({ maxNumberAttempts: 4 }), fetchExchange],
})

const userFragment = gql`
  fragment UserFields on User {
    avatarUrl
    bot
    discord
    github
    linkedin
    name
    username
    webUrl
  }
`

const projectMembersQuery = gql`
  {
    project(fullPath: "storyteller-platform/storyteller") {
      projectMembers {
        nodes {
          id
          user {
            ...UserFields
          }
        }
      }
    }
  }
  ${userFragment}
`
const commitsQuery = gql`
  query GetCommits($after: String) {
    project(fullPath: "storyteller-platform/storyteller") {
      repository {
        commits(ref: "main", first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            authorEmail
            author {
              ...UserFields
            }
          }
        }
      }
    }
  }
  ${userFragment}
`
type GraphQLUser = {
  name: string
  username: string
  bot: boolean
  webUrl: string
  avatarUrl: string
  github: string | null
  linkedin: string | null
  discord: string | null
}

type GraphQLMemberNode = {
  id: string
  user: GraphQLUser
}

type GraphQLCommitNode = {
  id: string
  authorEmail: string
  author: GraphQLUser
}

export type Contributor = Omit<GraphQLUser, "webUrl" | "bot"> & {
  gitlabUrl: string
  commits: number
  isMember: boolean
  emails: string[]
}

function normalizeGitLabUrl(url: string): string {
  return url?.startsWith("/") ? `https://gitlab.com${url}` : url
}

async function fetchProjectMembers(): Promise<GraphQLMemberNode[]> {
  const result = await client.query(projectMembersQuery, {}).toPromise()
  if (result.error) {
    throw new Error(`Failed to fetch project members: ${result.error.message}`)
  }
  return result.data?.project?.projectMembers?.nodes
}

async function fetchAllCommits(): Promise<GraphQLCommitNode[]> {
  const allCommits: GraphQLCommitNode[] = []
  let hasNextPage = true
  let cursor: string | null = null

  while (hasNextPage) {
    const result = await client
      .query(commitsQuery, { after: cursor })
      .toPromise()

    if (result.error) {
      throw new Error(
        `Failed to fetch commits (cursor: ${cursor}): ${result.error.message}`,
      )
    }

    const commits = result.data?.project?.repository?.commits
    if (!commits) break

    allCommits.push(...commits.nodes)
    hasNextPage = commits.pageInfo?.hasNextPage || false
    cursor = commits.pageInfo?.endCursor || null
  }

  return allCommits
}

async function fetchGitLabContributors(): Promise<Contributor[]> {
  try {
    const [projectMembers, allCommits] = await Promise.all([
      fetchProjectMembers(),
      fetchAllCommits(),
    ])

    const contributorMap = new Map<Contributor["username"], Contributor>()

    for (const projectMember of projectMembers) {
      const user = projectMember.user
      if (!user || user.bot) continue

      contributorMap.set(user.username, {
        name: user.name,
        username: user.username,
        gitlabUrl: user.webUrl,
        avatarUrl: normalizeGitLabUrl(user.avatarUrl),
        github: user.github,
        linkedin: user.linkedin,
        discord: user.discord,
        commits: 0,
        isMember: true,
        emails: [],
      })
    }

    // Add users who just commited to 'contributorMap'. This is done by
    // aggregating the commit counts by username.
    for (const commit of allCommits) {
      const author = commit.author
      if (!author || author.bot) continue

      if (contributorMap.has(author.username)) {
        const contributor = contributorMap.get(author.username)
        contributor.commits += 1

        if (
          commit.authorEmail &&
          !contributor.emails.includes(commit.authorEmail)
        ) {
          contributor.emails.push(commit.authorEmail)
        }
      } else {
        contributorMap.set(author.username, {
          name: author.name,
          username: author.username,
          gitlabUrl: author.webUrl,
          avatarUrl: normalizeGitLabUrl(author.avatarUrl),
          github: author.github,
          linkedin: author.linkedin,
          discord: author.discord,
          commits: 1,
          isMember: false,
          emails: [commit.authorEmail],
        })
      }
    }

    const contributors = Array.from(contributorMap.values())

    // Sort by membership status first, then commit count
    contributors.sort(
      (a, b) =>
        Number(b.isMember) - Number(a.isMember) || b.commits - a.commits,
    )

    return contributors
  } catch (error) {
    throw new Error(`Failed to fetch gitlab contributors: ${error}`)
  }
}

export const gitLabContributors: Promise<Contributor[]> =
  fetchGitLabContributors()
