import { readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import { type Readable } from "node:stream"

import { createReadableStreamFromReadable } from "@remix-run/node"
import contentDisposition from "content-disposition"
import { ZipFile } from "yazl"

// this needs to be first. if we add an epub first, Archive Util on Macos
// will think the whole thing is an epub.
export function createZip(first: { name: string; data: string }) {
  const zipfile = new ZipFile()
  zipfile.addBuffer(Buffer.from(first.data), first.name, { compress: false })
  return zipfile
}

export async function addFile(
  zipfile: ZipFile,
  filepath: string,
  name: string,
) {
  try {
    if (!(await stat(filepath)).isFile()) {
      return false
    }
  } catch {
    return false
  }

  zipfile.addFile(filepath, name, { compress: false })
  return true
}

export async function addDirectory(
  zipfile: ZipFile,
  dir: string,
  prefix: string,
  include?: (filename: string) => boolean,
) {
  let entries
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true })
  } catch {
    return 0
  }

  const filepaths = entries
    .filter((entry) => entry.isFile() && (!include || include(entry.name)))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort((a, b) => a.localeCompare(b))

  for (const filepath of filepaths) {
    zipfile.addFile(filepath, `${prefix}/${relative(dir, filepath)}`, {
      compress: false,
    })
  }

  return filepaths.length
}

export async function endZip(zipfile: ZipFile) {
  const stream = zipfile.outputStream as Readable

  const size = await new Promise<number>((resolve, reject) => {
    zipfile.on("error", (error: Error) => {
      reject(error)
      stream.destroy(error)
    })
    zipfile.end(undefined, resolve as () => void)
  })

  return { stream, size }
}

export function zipResponse(
  { stream, size }: { stream: Readable; size: number },
  filename: string,
) {
  return new Response(createReadableStreamFromReadable(stream), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": `${size}`,
      "Content-Disposition": contentDisposition(filename),
    },
  })
}
