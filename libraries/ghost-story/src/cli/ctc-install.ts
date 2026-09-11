/* eslint-disable no-console */

import { existsSync, statSync } from "node:fs"
import { join } from "node:path"

import { type CtcModelPackage } from "../constants.ts"

import { GITLAB_PROJECT_ID, getModelDir } from "./config.ts"
import { downloadFile } from "./install.ts"

export interface ModelPackageFile {
  /** path relative to the package root */
  fileName: string
  size: number
  sha256: string
}

interface GitLabPackageFile {
  file_name: string
  size: number
  file_sha256: string | null
}

export function getModelPackageDir(
  model: CtcModelPackage,
  modelDir: string = getModelDir(),
): string {
  return join(modelDir, model.subdir)
}

/**
 * Checks the entry file only, without asking the registry anything. Use this
 * to decide whether an install is needed, `installModelPackage` checks every
 * file against the manifest.
 */
export function isModelPackageInstalled(
  model: CtcModelPackage,
  modelDir: string = getModelDir(),
): boolean {
  return existsSync(join(getModelPackageDir(model, modelDir), model.entryFile))
}

export function getModelPackageFileUrl(
  model: CtcModelPackage,
  fileName: string,
): string {
  const filePath = fileName.split("/").map(encodeURIComponent).join("/")
  return `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/packages/ml_models/${model.modelVersionId}/files/${filePath}`
}

/**
 * Lists the files a package holds. The registry url-encodes path separators in
 * file names, so they are decoded back into relative paths here.
 */
export async function listModelPackageFiles(
  model: CtcModelPackage,
  signal?: AbortSignal | null,
): Promise<ModelPackageFile[]> {
  const url = `https://gitlab.com/api/v4/projects/${GITLAB_PROJECT_ID}/packages/${model.packageId}/package_files`
  const files: ModelPackageFile[] = []

  for (let page = 1; ; page++) {
    const response = await fetch(
      `${url}?per_page=100&page=${page}`,
      signal ? { signal } : undefined,
    )

    if (!response.ok) {
      throw new Error(
        `Failed to list files of ${model.name}@${model.version}: ${response.status} ${response.statusText}`,
      )
    }

    const batch = (await response.json()) as GitLabPackageFile[]

    for (const file of batch) {
      const fileName = decodeURIComponent(file.file_name)
      if (fileName.startsWith("/") || fileName.split("/").includes("..")) {
        throw new Error(
          `${model.name}@${model.version} contains an invalid file name: ${file.file_name}`,
        )
      }

      files.push({
        fileName,
        size: file.size,
        sha256: file.file_sha256 ?? "",
      })
    }

    if (batch.length < 100) {
      break
    }
  }

  return files
}

export interface InstallModelPackageOptions {
  modelDir?: string | undefined
  printOutput?: boolean | undefined
  force?: boolean | undefined
  onProgress?: ((downloaded: number, total: number) => void) | undefined
  signal?: AbortSignal | null | undefined
}

/**
 * Downloads every file of a model package into the model directory, skipping
 * files that are already there with the expected size.
 */
export async function installModelPackage(
  model: CtcModelPackage,
  options: InstallModelPackageOptions = {},
): Promise<string> {
  const {
    modelDir = getModelDir(),
    printOutput = true,
    force = false,
    onProgress,
    signal,
  } = options

  const destDir = getModelPackageDir(model, modelDir)
  const files = await listModelPackageFiles(model, signal)

  if (files.length === 0) {
    throw new Error(`${model.name}@${model.version} does not contain any files`)
  }

  let downloaded = 0

  for (const file of files) {
    const filePath = join(destDir, file.fileName)

    if (!force && isFileUpToDate(file, filePath)) {
      continue
    }

    await downloadFile({
      url: getModelPackageFileUrl(model, file.fileName),
      destPath: filePath,
      expectedSize: file.size,
      expectedSha256: file.sha256 === "" ? undefined : file.sha256,
      printOutput,
      onProgress,
      signal,
    })

    downloaded++
  }

  if (printOutput) {
    console.log(
      downloaded > 0
        ? `${model.name} installed to ${destDir}`
        : `${model.name} already installed at ${destDir}`,
    )
  }

  return destDir
}

function isFileUpToDate(file: ModelPackageFile, filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false
  }

  return statSync(filePath).size === file.size
}
