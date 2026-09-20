import { useMemo } from "react"

import { type StudioConfig, joinPath } from "../config"
import type { GitLabClient } from "../gitlab/client"
import type { BaseFile, ChangesetData } from "../model/changeset"
import type { OutlineVersion, SidebarOutline } from "../model/outline"
import { type SidebarsJson, parseSidebars } from "../model/sidebars"

import { fetchRemoteFile, useAsync } from "./hooks"

export interface SidebarModel {
  key: string
  version: OutlineVersion
  repoPath: string
  base: BaseFile
  sidebars: SidebarsJson | null
  local: boolean
}

export function sidebarModelKey(version: OutlineVersion) {
  return `${version.pluginId}:${version.version}`
}

export function useSidebarModels(
  client: GitLabClient,
  projectId: number | null,
  branch: string,
  outline: SidebarOutline,
  draft: ChangesetData | null,
  config: StudioConfig,
): SidebarModel[] {
  const versions = useMemo(
    () => outline.versions.filter((version) => version.sidebarFile !== null),
    [outline],
  )
  const remote = useAsync(
    projectId === null || versions.length === 0
      ? null
      : () =>
          Promise.all(
            versions.map(async (version): Promise<SidebarModel> => {
              const repoPath = joinPath(config.docsRoot, version.sidebarFile!)
              const file = await fetchRemoteFile(
                client,
                projectId,
                branch,
                repoPath,
              ).catch(() => null)
              return {
                key: sidebarModelKey(version),
                version,
                repoPath,
                base: {
                  content: file?.content ?? null,
                  lastCommitId: file?.lastCommitId ?? null,
                },
                sidebars: file ? parseSidebars(file.content) : null,
                local: false,
              }
            }),
          ),
    [client, projectId, branch, versions, config],
  )
  const localKey = JSON.stringify(
    versions.map((version) => {
      const repoPath = joinPath(config.docsRoot, version.sidebarFile!)
      const change = draft?.changes[repoPath]
      return change?.kind === "text" ? change.content : ""
    }),
  )
  return useMemo(() => {
    const models = remote.data ?? []
    const locals = JSON.parse(localKey) as string[]
    return models.map((model, index) => {
      const text = locals[index]
      if (!text) return model
      return {
        ...model,
        sidebars: parseSidebars(text) ?? model.sidebars,
        local: true,
      }
    })
  }, [remote.data, localKey])
}
