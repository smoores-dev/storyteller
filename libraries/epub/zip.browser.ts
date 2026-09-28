import {
  BlobReader,
  type FileEntry,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
} from "@zip.js/zip.js/lib/zip-core-native.js"

import { openFile } from "#files"

import type {
  ArchiveSource,
  ZipArchive,
  ZipEntry,
} from "./adapters/interface.ts"

const MAX_APPENDED_DATA = 1024 * 1024

function toZipEntry(entry: FileEntry): ZipEntry {
  return {
    filename: entry.filename,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    read: () => entry.getData(new Uint8ArrayWriter()),
  }
}

export async function openZip(source: ArchiveSource): Promise<ZipArchive> {
  const data = typeof source === "string" ? await openFile(source) : source
  const reader = new ZipReader(
    data instanceof Uint8Array
      ? new Uint8ArrayReader(data)
      : new BlobReader(data),
    {
      useWebWorkers: false,
      // this in combination with maxAppendedDataSize is basically the manual fix
      // we used to have for yauzl: sometimes zips has garbage at the end that
      // would cause an error. zip.js has native support for this
      strictness: "tolerant",
      maxAppendedDataSize: MAX_APPENDED_DATA,
      filenameValidation: "balanced",
      checkCrc32: true,
    },
  )
  const entries = await reader.getEntries()
  return {
    entries: entries
      .filter((entry): entry is FileEntry => !entry.directory)
      .map(toZipEntry),
    close: () => reader.close(),
  }
}
