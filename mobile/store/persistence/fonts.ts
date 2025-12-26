import * as FileSystem from "expo-file-system/legacy"

import { type CustomFont } from "@/database/preferencesTypes"

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

export function parseCustomFont(fontUrl: string): CustomFont {
  const segments = fontUrl.split("/")
  const filename = segments[segments.length - 1]!
  const extDot = filename.lastIndexOf(".")
  const name = filename.slice(0, extDot)
  const ext = filename.slice(extDot + 1)
  return {
    filename,
    name,
    type: ext as "ttf" | "otf",
  }
}
