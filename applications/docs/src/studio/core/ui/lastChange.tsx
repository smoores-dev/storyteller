import React from "react"

import type { GitLabClient, GitLabCommit } from "../gitlab/client"

import { type AsyncState, useAsync } from "./hooks"

export interface LastChange {
  commit: GitLabCommit
  tag: string | null
}

const cache = new Map<string, Promise<LastChange | null>>()

export function invalidateLastChanges() {
  cache.clear()
}

export function useLastChange(
  client: GitLabClient,
  projectId: number | null,
  ref: string,
  repoPath: string | null,
): AsyncState<LastChange | null> {
  return useAsync(
    projectId === null || repoPath === null
      ? null
      : () => {
          const key = `${projectId}:${ref}:${repoPath}`
          let pending = cache.get(key)
          if (pending === undefined) {
            pending = client
              .listCommits(projectId, ref, repoPath, 1)
              .then(async (commits) => {
                const commit = commits[0]
                if (!commit) return null
                const tags = await client
                  .commitTags(projectId, commit.id)
                  .catch(() => [])
                return { commit, tag: tags[0]?.name ?? null }
              })
              .catch((error: unknown) => {
                cache.delete(key)
                throw error
              })
            cache.set(key, pending)
          }
          return pending
        },
    [client, projectId, ref, repoPath],
  )
}

export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const seconds = Math.round((now - then) / 1000)
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ]
  let value = seconds
  let unit: Intl.RelativeTimeFormatUnit = "second"
  for (const [size, name] of units) {
    unit = name
    if (Math.abs(value) < size) break
    value /= size
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    -Math.round(value),
    unit,
  )
}

export function LastChanged({
  state,
  className = "",
}: {
  state: AsyncState<LastChange | null>
  className?: string
}) {
  const change = state.data
  if (!change) return null
  const { commit, tag } = change
  return (
    <span className={`text-muted text-[12px] ${className}`}>
      <a
        href={commit.web_url}
        target="_blank"
        rel="noreferrer"
        className="text-muted hover:text-ink"
        title={`${commit.title}\n${commit.short_id} · ${new Date(commit.committed_date).toLocaleString()}`}
      >
        Last changed {relativeTime(commit.committed_date)} by{" "}
        {commit.author_name}
      </a>
      {tag && (
        <span title="Most recent tag that contains this change"> · {tag}</span>
      )}
    </span>
  )
}
