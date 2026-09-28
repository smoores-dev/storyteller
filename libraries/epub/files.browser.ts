const PATHS_NEED_NODE =
  "File paths only work in Node.js. Pass the EPUB as a Blob, File or Uint8Array instead."

export function openFile(path: string): Promise<Blob> {
  return Promise.reject(new Error(`Cannot open "${path}". ${PATHS_NEED_NODE}`))
}

export function copyFile(from: string, to: string): Promise<void> {
  return Promise.reject(
    new Error(`Cannot copy "${from}" to "${to}". ${PATHS_NEED_NODE}`),
  )
}
