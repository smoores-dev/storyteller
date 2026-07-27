import { execSync } from "node:child_process"
import { join } from "node:path"

import { getPluginConfiguration } from "@yarnpkg/cli"
import { Project, Configuration, type Workspace } from "@yarnpkg/core"
import { npath } from "@yarnpkg/fslib"

const startingCwd = npath.toPortablePath(process.cwd())

const configuration = await Configuration.find(
  startingCwd,
  getPluginConfiguration(),
)
const { project } = await Project.find(configuration, startingCwd)

const upgradedWorkspaces: Workspace[] = []

for (const workspace of project.workspaces) {
  if (!workspace.manifest.version) continue

  const diff = execSync(
    `git diff HEAD^ -- ${join(workspace.relativeCwd, "package.json")}`,
    {
      encoding: "utf-8",
    },
  )
  const hasBeenUpgraded = /^\+\s*"version":/gm.test(diff)
  if (hasBeenUpgraded) upgradedWorkspaces.push(workspace)
}

for (const workspace of upgradedWorkspaces) {
  const version = workspace.manifest.version!
  const shortName = workspace.manifest.name!.name

  const tagName = `${shortName}-v${version}`
  execSync(`git tag ${tagName}`)
  execSync(`git push origin tag ${tagName}`)
}
