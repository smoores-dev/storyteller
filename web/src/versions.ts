import packageJson from "../package.json"

import { env } from "./env"

// Definition: Contains the version of the web app.
export function getCurrentVersion() {
  const versionString = env.CI_COMMIT_TAG
  const version =
    versionString?.match(/^web-v(.*)$/)?.[1] ?? packageJson.version

  return version
}

export const BETA_TAGS = [
  "rc",
  "beta",
  "alpha",
  "experimental",
  "preview",
  "dev",
  "test",
]

export function compareVersions(version1: string, version2: string) {
  const [_, v1Version, beta1] = version1.match(/(.*?)(?:-(\w*\.\d+))?$/) ?? []
  const [__, v2Version, beta2] = version2.match(/(.*?)(?:-(\w*\.\d+))?$/) ?? []
  const [beta1Tag, beta1Version] = beta1?.split(".") ?? []
  const [beta2Tag, beta2Version] = beta2?.split(".") ?? []

  if (!v1Version || !v2Version) return -1

  const version1Parts = v1Version.split(".").map(Number)
  const version2Parts = v2Version.split(".").map(Number)

  let result = 0

  for (
    let i = 0;
    i < Math.max(version1Parts.length, version2Parts.length);
    i++
  ) {
    const v1 = version1Parts[i] ?? 0
    const v2 = version2Parts[i] ?? 0

    if (v1 > v2) {
      result = 1
      break
    }
    if (v1 < v2) {
      result = -1
      break
    }
  }

  if (beta1Tag && beta2Tag) {
    if (!beta1Version && beta2Version) return -1
    if (beta1Version && !beta2Version) return 1

    if (BETA_TAGS.indexOf(beta1Tag) > BETA_TAGS.indexOf(beta2Tag)) return 1
    if (BETA_TAGS.indexOf(beta1Tag) < BETA_TAGS.indexOf(beta2Tag)) return -1

    if (beta1Tag === beta2Tag) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return compareVersions(beta1Version!, beta2Version!)
    }

    return 0
  }

  if (result !== 0) return result
  if (beta1 && !beta2) return 1
  if (!beta1 && beta2) return -1

  return 0
}
