import { execSync } from "node:child_process"
import { join } from "node:path"

import { getPluginConfiguration } from "@yarnpkg/cli"
import {
  Project,
  Configuration,
  type Workspace,
  miscUtils,
  structUtils,
} from "@yarnpkg/core"
import { npath, PortablePath, ppath, xfs } from "@yarnpkg/fslib"
import { parseSyml, stringifySyml } from "@yarnpkg/parsers"
import { gitUtils } from "@yarnpkg/plugin-git"
import { omit } from "es-toolkit/compat"
import semver from "semver"

type Releases = Map<Workspace, string>

const Decision = {
  UNDECIDED: `undecided`,
  DECLINE: `decline`,
  MAJOR: `major`,
  MINOR: `minor`,
  PATCH: `patch`,
  PREMAJOR: `premajor`,
  PREMINOR: `preminor`,
  PREPATCH: `prepatch`,
  PRERELEASE: `prerelease`,
}

type VersionFile = {
  project: Project

  changedFiles: Set<PortablePath>
  changedWorkspaces: Set<Workspace>

  releaseRoots: Set<Workspace>
  releases: Releases

  saveAll: () => Promise<void>
} & (
  | {
      root: PortablePath

      baseHash: string
      baseTitle: string
    }
  | {
      root: null

      baseHash: null
      baseTitle: null
    }
)

async function main() {
  const startingCwd = npath.toPortablePath(process.cwd())

  const configuration = await Configuration.find(
    startingCwd,
    getPluginConfiguration(),
  )
  const { project } = await Project.find(configuration, startingCwd)

  const versionFiles = await openVersionFiles(project)

  const unreleasedWorkspaces: Workspace[] = []

  if (versionFiles.length) {
    for (const versionFile of versionFiles) {
      for (const workspace of versionFile.changedWorkspaces) {
        if (!workspace.manifest.version) continue
        if (versionFile?.releases.has(workspace)) continue
        const diff = execSync(
          `git diff origin/main -- ${join(workspace.relativeCwd, "package.json")}`,
          {
            encoding: "utf-8",
          },
        )
        const hasBeenUpgraded = /^\+\s*"version":/gm.test(diff)
        if (!hasBeenUpgraded) unreleasedWorkspaces.push(workspace)
      }
    }
  } else {
    const changedWorkspaces = await gitUtils.fetchChangedWorkspaces({
      ref: "origin/main",
      project,
    })
    unreleasedWorkspaces.push(
      ...Array.from(changedWorkspaces).filter((w) => w.manifest.version),
    )
  }

  if (unreleasedWorkspaces.length) {
    console.error(`The following workspaces have been changed, but have no release strategy:

${unreleasedWorkspaces.map((w) => `@${w.manifest.name?.scope}/${w.manifest.name?.name}`).join("\n")}`)
    process.exit(1)
  }

  console.log(
    "All changed workspaces have either release strategy or version bump",
  )
  process.exit(0)
}

async function openVersionFiles(project: Project) {
  const configuration = project.configuration

  if (!configuration.projectCwd) return []

  const root = await gitUtils.fetchRoot(configuration.projectCwd)

  const base =
    root !== null
      ? await gitUtils.fetchBase(root, {
          baseRefs: configuration.get(`changesetBaseRefs`),
        })
      : null

  const changedFiles =
    root !== null
      ? await gitUtils.fetchChangedFiles(root, { base: base!.hash, project })
      : []

  const deferredVersionFolder = configuration.get(
    `deferredVersionFolder`,
  ) as PortablePath
  const versionFiles = changedFiles.filter(
    (p) => ppath.contains(deferredVersionFolder, p) !== null,
  )

  const changedWorkspaces: Set<Workspace> = new Set(
    miscUtils.mapAndFilter(changedFiles, (file) => {
      const workspace = project.tryWorkspaceByFilePath(file)
      if (workspace === null) return miscUtils.mapAndFilter.skip

      return workspace
    }),
  )

  return await Promise.all(
    versionFiles.map(async (versionPath) => {
      const versionContent = xfs.existsSync(versionPath)
        ? await xfs.readFilePromise(versionPath, `utf8`)
        : `{}`

      const versionData = parseSyml(versionContent)
      const releaseStore: Releases = new Map()

      for (const identStr of versionData.declined || []) {
        const ident = structUtils.parseIdent(identStr)
        const workspace = project.getWorkspaceByIdent(ident)

        releaseStore.set(workspace, Decision.DECLINE)
      }

      for (const [identStr, decision] of Object.entries(
        versionData.releases || {},
      )) {
        const ident = structUtils.parseIdent(identStr)
        const workspace = project.getWorkspaceByIdent(ident)

        releaseStore.set(workspace, validateReleaseDecision(decision))
      }

      return {
        project,

        root,

        baseHash: base !== null ? base.hash : null,

        baseTitle: base !== null ? base.title : null,

        changedFiles: new Set(changedFiles),
        changedWorkspaces,

        releaseRoots: new Set(
          [...changedWorkspaces].filter(
            (workspace) => workspace.manifest.version !== null,
          ),
        ),
        releases: releaseStore,

        async saveAll() {
          const releases: { [key: string]: string } = {}
          const declined: Array<string> = []
          const undecided: Array<string> = []

          for (const workspace of project.workspaces) {
            // Let's assume that packages without versions don't need to see their version increased
            if (workspace.manifest.version === null) continue

            const identStr = structUtils.stringifyIdent(
              workspace.anchoredLocator,
            )

            const decision = releaseStore.get(workspace)
            if (decision === Decision.DECLINE) {
              declined.push(identStr)
            } else if (typeof decision !== `undefined`) {
              releases[identStr] = validateReleaseDecision(decision)
            } else if (changedWorkspaces.has(workspace)) {
              undecided.push(identStr)
            }
          }

          await xfs.mkdirPromise(ppath.dirname(versionPath), {
            recursive: true,
          })

          await xfs.changeFilePromise(
            versionPath,
            stringifySyml(
              new stringifySyml.PreserveOrdering({
                releases:
                  Object.keys(releases).length > 0 ? releases : undefined,
                declined: declined.length > 0 ? declined : undefined,
                undecided: undecided.length > 0 ? undecided : undefined,
              }),
            ),
          )
        },
      } as VersionFile
    }),
  )
}

function validateReleaseDecision(decision: unknown): string {
  const semverDecision = semver.valid(decision as string)
  if (semverDecision) return semverDecision

  return miscUtils.validateEnum(omit(Decision, `UNDECIDED`), decision as string)
}

await main()
