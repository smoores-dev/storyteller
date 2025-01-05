// Definition: Contains the version of the web app.
export function getCurrentVersion() {
  const versionString = process.env["CI_COMMIT_TAG"]
  const version = versionString?.match(/^web-v(.*)$/)?.[1] ?? "development"
  return version
}
