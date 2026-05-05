import { logger } from "@/logging"

import { db } from "./connection"

const GITLAB_PROJECT_ID = "67994333"
const GITLAB_RELEASES_URL = `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/releases`
const RELEVANT_PREFIXES = ["web-v", "mobile-v"] as const

type ComponentPrefix = (typeof RELEVANT_PREFIXES)[number]

const COMPONENT_MAP: Record<ComponentPrefix, string> = {
  "web-v": "web",
  "mobile-v": "mobile",
}

type GitLabRelease = {
  tag_name: string
  description: string | null
  description_html: string | null
  released_at: string
}

function parseTag(
  tagName: string,
): { component: string; version: string } | null {
  for (const prefix of RELEVANT_PREFIXES) {
    if (!tagName.startsWith(prefix)) continue

    return {
      component: COMPONENT_MAP[prefix],
      version: tagName.slice(prefix.length),
    }
  }

  return null
}

async function fetchReleasesPage(
  page: number,
  perPage: number,
): Promise<GitLabRelease[]> {
  const url = `${GITLAB_RELEASES_URL}?per_page=${perPage}&page=${page}&include_html_description=true`

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(
      `GitLab releases API returned ${response.status}: ${response.statusText}`,
    )
  }

  const release = (await response.json()) as GitLabRelease[]

  return release
}

async function tagExists(tagName: string): Promise<boolean> {
  const row = await db
    .selectFrom("changelog")
    .select("uuid")
    .where("tagName", "=", tagName)
    .executeTakeFirst()

  return !!row
}

export async function syncChangelog(): Promise<void> {
  logger.info("Syncing changelog from GitLab releases...")

  const perPage = 50
  let page = 1
  let totalInserted = 0

  // eslint-disable-next-line no-constant-condition, @typescript-eslint/no-unnecessary-condition
  while (true) {
    let releases: GitLabRelease[]

    try {
      releases = await fetchReleasesPage(page, perPage)
    } catch (err) {
      logger.error(err, "Failed to fetch GitLab releases page %d", page)
      break
    }

    if (releases.length === 0) break

    let allKnown = true

    for (const release of releases) {
      const parsed = parseTag(release.tag_name)
      if (!parsed) continue

      const alreadyExists = await tagExists(release.tag_name)
      if (alreadyExists) continue

      allKnown = false

      await db
        .insertInto("changelog")
        .values({
          tagName: release.tag_name,
          version: parsed.version,
          component: parsed.component,
          description: release.description_html ?? release.description,
          releasedAt: release.released_at,
        })
        .onConflict((oc) => oc.column("tagName").doNothing())
        .execute()

      totalInserted++
    }

    // if every relevant release on this page was already stored, we can stop
    if (allKnown) break

    // if this page was not full, there are no more pages
    if (releases.length < perPage) break

    page++
  }

  logger.info("Changelog sync complete, inserted %d new entries", totalInserted)
}

export type ChangelogEntry = {
  uuid: string
  tagName: string
  version: string
  component: string
  description: string | null
  releasedAt: string
}

export async function getChangelog(
  component: string,
  options?: { page?: number; perPage?: number },
): Promise<ChangelogEntry[]> {
  const page = options?.page ?? 1
  const perPage = options?.perPage ?? 20
  const offset = (page - 1) * perPage

  return db
    .selectFrom("changelog")
    .select([
      "uuid",
      "tagName",
      "version",
      "component",
      "description",
      "releasedAt",
    ])
    .where("component", "=", component)
    .orderBy("releasedAt", "desc")
    .limit(perPage)
    .offset(offset)
    .execute()
}

export async function getLatestVersion(
  component: string,
  options?: { beta?: boolean },
): Promise<string | null> {
  const row = await db
    .selectFrom("changelog")
    .select("version")
    .where("component", "=", component)
    .$if(!options?.beta, (qb) => qb.where("version", "not like", "%-%"))
    .orderBy("releasedAt", "desc")
    .limit(1)
    .executeTakeFirst()

  return row?.version ?? null
}
