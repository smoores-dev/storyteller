import React, { useMemo } from "react"

import type { GitLabClient, GitLabProject } from "../gitlab/client"
import type { BaseFile, ChangesetData } from "../model/changeset"
import {
  BUMPS,
  type Bump,
  VERSIONS_DIR,
  decisionFor,
  isVersionFile,
  parseVersionFile,
  serializeVersionFile,
  touchedLibraries,
  versionFileName,
  withDecision,
} from "../model/versionFile"

import { codeChip, errorText, hint, warnText } from "./classes"
import { describeError, fetchRemoteFile, useAsync } from "./hooks"

interface VersionFileSectionProps {
  client: GitLabClient
  upstream: GitLabProject
  source: GitLabProject
  branch: string
  defaultBranch: string
  branchExists: boolean
  releasePackage: string
  draft: ChangesetData | null
  onChange: (path: string, content: string, base: BaseFile) => void
}

interface Located {
  path: string
  committed: boolean
  conflict: boolean
  touched: string[]
}

export function VersionFileSection(props: VersionFileSectionProps) {
  const {
    client,
    upstream,
    source,
    branch,
    defaultBranch,
    branchExists,
    releasePackage,
    draft,
    onChange,
  } = props
  const draftPaths = useMemo(
    () => Object.keys(draft?.changes ?? {}).sort(),
    [draft],
  )
  const draftKey = draftPaths.join("\n")
  const located = useAsync<Located>(async () => {
    const compared = branchExists
      ? await client
          .compare(
            source.id,
            defaultBranch,
            branch,
            source.id === upstream.id ? undefined : upstream.id,
          )
          .catch(() => null)
      : null
    const committedPaths = (compared?.diffs ?? []).map(
      (diff) => diff.new_path || diff.old_path,
    )
    const committedVersions = (compared?.diffs ?? [])
      .filter((diff) => diff.new_file && isVersionFile(diff.new_path))
      .map((diff) => diff.new_path)
    const draftVersions = draftPaths.filter(isVersionFile)
    const all = [...new Set([...committedVersions, ...draftVersions])]
    const path = all[0] ?? (await versionFileName(branch))
    return {
      path,
      committed: committedVersions.includes(path),
      conflict: all.length > 1,
      touched: touchedLibraries([...committedPaths, ...draftPaths]),
    }
  }, [
    client,
    source.id,
    upstream.id,
    branch,
    defaultBranch,
    branchExists,
    draftKey,
  ])
  const path = located.data?.path ?? null
  const local = path ? draft?.changes[path] : undefined
  const remote = useAsync(
    path && located.data?.committed && local?.kind !== "text"
      ? () => fetchRemoteFile(client, source.id, branch, path)
      : null,
    [client, source.id, branch, path, located.data?.committed],
  )
  const libraries = useAsync(
    located.data && located.data.touched.length > 0
      ? async () => {
          const names: { dir: string; name: string | null }[] = []
          for (const dir of located.data!.touched) {
            const file = await fetchRemoteFile(
              client,
              source.id,
              branch,
              `libraries/${dir}/package.json`,
            ).catch(() => null)
            let name: string | null = null
            try {
              name = file
                ? ((JSON.parse(file.content) as { name?: string }).name ?? null)
                : null
            } catch {
              name = null
            }

            names.push({ dir, name })
          }

          return names
        }
      : null,
    [client, source.id, branch, located.data?.touched.join("\n")],
  )
  const text =
    local?.kind === "text" ? local.content : (remote.data?.content ?? "")
  const base: BaseFile =
    local?.kind === "text"
      ? local.base
      : {
          content: remote.data?.content ?? null,
          lastCommitId: remote.data?.lastCommitId ?? null,
        }
  const decisions = useMemo(() => parseVersionFile(text), [text])
  const rows = [
    { name: releasePackage, label: "Docs" },
    ...(libraries.data ?? [])
      .filter((entry): entry is { dir: string; name: string } =>
        Boolean(entry.name),
      )
      .map((entry) => ({ name: entry.name, label: `Library ${entry.dir}` })),
  ]
  if (located.status === "loading") {
    return <p className={hint}>Checking release notes…</p>
  }

  if (located.status === "error") {
    return <p className={errorText}>{describeError(located.error)}</p>
  }

  if (!path) {
    return null
  }

  if (located.data?.conflict) {
    return (
      <p className={warnText}>
        This branch has more than one version file in {VERSIONS_DIR}. Merge them
        into one on GitLab before choosing a release type here.
      </p>
    )
  }

  const choose = (name: string, bump: Bump) => {
    onChange(
      path,
      serializeVersionFile(withDecision(decisions, name, bump)),
      base,
    )
  }

  const undecided = rows.some(
    (row) => decisionFor(decisions, row.name) === null,
  )
  const applyDefaults = () => {
    let next = decisions
    for (const [index, row] of rows.entries()) {
      if (decisionFor(next, row.name) !== null) {
        continue
      }

      next = withDecision(next, row.name, index === 0 ? "patch" : "none")
    }

    onChange(path, serializeVersionFile(next), base)
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[14px] font-semibold">Release notes</h3>
      <p className={hint}>
        The merge request needs a version file in{" "}
        <code className={codeChip}>{path}</code> saying how each changed package
        is released. It is saved with your next commit.
      </p>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const value = decisionFor(decisions, row.name)
          return (
            <label
              key={row.name}
              className="flex flex-wrap items-center gap-2 text-[13px]"
            >
              <span className="w-40 truncate" title={row.name}>
                {row.label}
              </span>
              <select
                className="border-line-strong bg-surface text-ink rounded-md border px-2 py-1 text-[13px]"
                value={value ?? ""}
                onChange={(event) =>
                  choose(row.name, event.target.value as Bump)
                }
              >
                {value === null && (
                  <option value="" disabled>
                    Choose…
                  </option>
                )}
                {BUMPS.map((bump) => (
                  <option key={bump.value} value={bump.value}>
                    {bump.label}
                  </option>
                ))}
              </select>
            </label>
          )
        })}
      </div>
      {libraries.status === "loading" && (
        <p className={hint}>Looking up the libraries you changed…</p>
      )}
      {undecided && (
        <div>
          <button
            type="button"
            className="border-line-strong text-ink hover:bg-hover cursor-pointer rounded-md border bg-transparent px-2.5 py-1 text-[13px]"
            onClick={applyDefaults}
          >
            Docs patch, no release for the rest
          </button>
        </div>
      )}
    </div>
  )
}
