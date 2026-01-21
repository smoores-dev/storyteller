import type { LoadContext } from "@docusaurus/types"
import { gql, request } from "graphql-request"

const graphqlQuery = gql`
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

  {
    project(fullPath: "storyteller-platform/storyteller") {
      name
      fullPath
      projectMembers {
        nodes {
          id
          user {
            ...UserFields
          }
        }
      }
      repository {
        commits(ref: "main") {
          nodes {
            id
            author {
              ...UserFields
            }
          }
        }
      }
    }
  }
`

export interface Contributor {
  name: string
  username: string
  gitlabUrl: string
  avatarUrl: string
  github: string | null
  linkedin: string | null
  discord: string | null
  commits: number
  isMember: boolean
}

interface ProjectMember {
  id: string
  user: Omit<Contributor, "commits" | "isMember">
}

interface RepoCommit {
  id: string
  author: Omit<Contributor, "commits" | "isMember">
}

function makeAbsoluteUrl(url: string): string {
  return url?.startsWith("/") ? `https://gitlab.com${url}` : url
}

export default function (context: LoadContext) {
  return {
    name: "fetch-contributors-plugin",
    async loadContent(): Promise<{
      projectMembers: ProjectMember[]
      repoCommits: RepoCommit[]
    } | null> {
      try {
        const response = await request(
          "https://gitlab.com/api/graphql",
          graphqlQuery,
        )

        return {
          projectMembers: response.project?.projectMembers?.nodes || [],
          repoCommits: response.project?.repository?.commits?.nodes || [],
        }
      } catch (error) {
        console.error("Failed to fetch contributors:", error.message)
        return null
      }
    },
    async contentLoaded({ content, actions }) {
      const { createData, addRoute } = actions
      const { projectMembers, repoCommits } = content

      if (
        (!projectMembers || projectMembers.length === 0) &&
        (!repoCommits || repoCommits.length === 0)
      ) {
        console.warn(
          "[fetch-contributors] No data fetched, skipping JSON write",
        )
        return
      }

      const contributorMap = new Map()

      for (const projectMember of projectMembers) {
        const user = projectMember.user
        if (!user || !user.name || user.bot) continue

        contributorMap.set(user.name, {
          name: user.name,
          username: user.username,
          gitlabUrl: user.webUrl,
          avatarUrl: makeAbsoluteUrl(user.avatarUrl),
          github: user.github,
          linkedin: user.linkedin,
          discord: user.discord,
          commits: 0,
          isMember: true,
        })
      }

      for (const repoCommit of repoCommits) {
        const author = repoCommit.author
        if (!author || !author.name || author.bot) continue

        const key = author.name
        if (contributorMap.has(key)) {
          contributorMap.get(key).commits += 1
        } else {
          contributorMap.set(key, {
            name: author.name,
            username: author.username,
            gitlabUrl: author.webUrl,
            avatarUrl: makeAbsoluteUrl(author.avatarUrl),
            github: author.github,
            linkedin: author.linkedin,
            discord: author.discord,
            commits: 1,
            isMember: false,
          })
        }
      }

      const transformedContributors: Contributor[] = Array.from(
        contributorMap.values(),
      ).sort((a, b) => {
        // Members first, then sort by commits
        if (a.isMember !== b.isMember) {
          return a.isMember ? -1 : 1
        }
        return b.commits - a.commits
      })

      const contributorsJsonPath = await createData(
        "contributors.json",
        JSON.stringify(transformedContributors),
      )

      addRoute({
        path: `${context.baseUrl}team`,
        component: "@site/src/pages/_team",
        modules: {
          contributors: contributorsJsonPath,
        },
        exact: true,
      })
    },
  }
}
