import * as FileSystem from "expo-file-system"

export function getCustomFontsDirectoryUrl() {
  return `${FileSystem.documentDirectory}fonts/`
}

export function getCustomFontUrl(name: string) {
  return `${getCustomFontsDirectoryUrl()}${name}`
}

export async function ensureFontsDirectory() {
  try {
    await FileSystem.makeDirectoryAsync(getCustomFontsDirectoryUrl())
  } catch {
    // This will throw if the directory already exists — that's fine!
  }
}

export async function listCustomFontUrls() {
  try {
    const filenames = await FileSystem.readDirectoryAsync(
      getCustomFontsDirectoryUrl(),
    )
    return filenames.map((f) => `${getCustomFontsDirectoryUrl()}${f}`)
  } catch {
    return []
  }
}
