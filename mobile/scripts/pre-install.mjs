#!/usr/bin/env node

/**
 * @fileoverview
 *
 * The @storyteller-platform/mobile app depends on @storyteller-platform/web
 * so that it can directly import some API boundary types. This means that in
 * order to install mobile app dependencies, we have to install all of the web
 * dependencies, which we don't want to do, both because it's time consuming
 * and because we don't want to bother with getting everything installed
 * in the EAS enironment.
 *
 * This script just removes the web dependency from the mobile package.json.
 * This is safe to do because we only import types, metro strips type-only
 * imports, and we don't do any type checking in EAS (that happens in GitLab).
 */

import { readFile, writeFile } from "node:fs/promises"

const mobileManifestPath = "./package.json"

const manifestContents = await readFile(mobileManifestPath, {
  encoding: "utf-8",
})

const manifest = JSON.parse(manifestContents)

delete manifest.devDependencies["@storyteller-platform/web"]

await writeFile(mobileManifestPath, JSON.stringify(manifest, null, 2), {
  encoding: "utf-8",
})
