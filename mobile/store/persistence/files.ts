import * as FileSystem from "expo-file-system"

export function getBooksDirectoryUrl() {
  return `${FileSystem.documentDirectory}books/`
}

export async function ensureBooksDirectory() {
  const coversDirInfo = await FileSystem.getInfoAsync(getBooksDirectoryUrl())
  if (!coversDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getBooksDirectoryUrl(), {})
  }
}

export function getBookArchivesDirectoryUrl() {
  return `${getBooksDirectoryUrl()}archives/`
}

export function getBookCoversDirectoryUrl() {
  return `${getBooksDirectoryUrl()}covers/`
}

export function getAudioBookCoversDirectoryUrl() {
  return `${getBooksDirectoryUrl()}audiocovers/`
}

export function getBookExtractedDirectoryUrl() {
  return `${getBooksDirectoryUrl()}extracted/`
}

export function getOldLocalBookCoverUrl(bookId: number) {
  return `${getBookCoversDirectoryUrl()}${bookId}`
}

export function getLocalBookCoverUrl(bookId: number) {
  return `${getBookCoversDirectoryUrl()}${bookId}.jpg`
}

export function getOldLocalAudioBookCoverUrl(bookId: number) {
  return `${getAudioBookCoversDirectoryUrl()}${bookId}`
}

export function getLocalAudioBookCoverUrl(bookId: number) {
  return `${getAudioBookCoversDirectoryUrl()}${bookId}.jpg`
}

export function getLocalBookArchiveUrl(bookId: number) {
  return `${getBookArchivesDirectoryUrl()}${bookId}.epub`
}

export function getLocalBookExtractedUrl(bookId: number) {
  return `${getBookExtractedDirectoryUrl()}${bookId}/`
}

export function getLocalBookFileUrl(bookId: number, relativeFilepath: string) {
  return `${getLocalBookExtractedUrl(bookId)}${relativeFilepath
    .split("/")

    .map((s) =>
      encodeURIComponent(s)
        // The sync system percent-encodes single quotes as %27,
        // but Readium decodes them back to single quotes,
        // so we need to replace single quotes with percent-encoded
        // %27 (as %2527) in order to match the actual file names
        // on disk
        .replaceAll("'", "%2527"),
    )
    .join("/")}`
}

async function readDirectoryAsyncRecursive(
  directory: string,
): Promise<string[]> {
  const files: string[] = []
  const directories: string[] = []
  const entries = await FileSystem.readDirectoryAsync(directory)
  for (const entry of entries) {
    const fullEntry = `${directory}/${entry}`
    const entryInfo = await FileSystem.getInfoAsync(fullEntry)
    if (entryInfo.isDirectory) {
      directories.push(fullEntry)
    } else {
      files.push(fullEntry)
    }
  }
  return [
    ...files,
    ...(await Promise.all(directories.map(readDirectoryAsyncRecursive))).flat(),
  ]
}

export async function readLocalBookCssFileMap(bookId: number) {
  const localBookExtractedUrl = getLocalBookExtractedUrl(bookId)
  const allFilenames = await readDirectoryAsyncRecursive(localBookExtractedUrl)
  const cssFilenames = allFilenames.filter((f) => f.endsWith(".css"))
  return Object.fromEntries(
    await Promise.all(
      cssFilenames.map(async (f) => {
        const contents = await FileSystem.readAsStringAsync(f, {
          encoding: "utf8",
        })
        return [
          f.replace(`${localBookExtractedUrl}`, "file://"),
          contents,
        ] as const
      }),
    ),
  )
}

export async function readLocalBookCssFileMaps(bookIds: number[]) {
  return Object.fromEntries(
    await Promise.all(
      bookIds.map(async (id) => {
        const cssMap = await readLocalBookCssFileMap(id)
        return [id, cssMap] as const
      }),
    ),
  )
}

export async function readBookFile(bookId: number, relativeFilepath: string) {
  return await FileSystem.readAsStringAsync(
    getLocalBookFileUrl(bookId, relativeFilepath),
  )
}

export async function deleteLocalBookFiles(bookId: number) {
  return await Promise.all([
    FileSystem.deleteAsync(getLocalBookExtractedUrl(bookId), {
      idempotent: true,
    }),
    FileSystem.deleteAsync(getLocalBookArchiveUrl(bookId), {
      idempotent: true,
    }),
  ])
}

export function getLocalBookUrl(baseUrl: string, bookId: number) {
  return `${baseUrl}/${bookId}/`
}

export async function isBookDownloaded(bookId: number) {
  return (await FileSystem.getInfoAsync(getLocalBookExtractedUrl(bookId)))
    .exists
}

export async function ensureCoversDirectory() {
  await ensureBooksDirectory()
  const coversDirInfo = await FileSystem.getInfoAsync(
    getBookCoversDirectoryUrl(),
  )
  if (!coversDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getBookCoversDirectoryUrl(), {})
  }
  const audioCoversDirInfo = await FileSystem.getInfoAsync(
    getAudioBookCoversDirectoryUrl(),
  )
  if (!audioCoversDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(getAudioBookCoversDirectoryUrl(), {})
  }
}
