import * as os from "node:os"
import { join } from "node:path"

export function getAppDataDir(appName: string) {
  let dataDir: string

  const platform = process.platform
  const homeDir = os.homedir()

  if (platform === "win32") {
    dataDir = join(homeDir, "AppData", "Local", appName)
  } else if (platform === "darwin") {
    dataDir = join(homeDir, "Library", "Application Support", appName)
  } else if (platform === "linux") {
    dataDir = join(homeDir, ".local", "share", appName)
  } else {
    throw new Error(`Unsupport platform ${platform}`)
  }

  return dataDir
}
