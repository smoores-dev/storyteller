import type {
  EpubStorageAdapter,
  EpubStorageAdapterClass,
} from "./interface.ts"

function unavailable(): Promise<EpubStorageAdapter> {
  return Promise.reject(
    new Error(
      "TmpFsAdapter extracts EPUBs to a temp directory and only works in Node.js. Use Epub.using(MemoryAdapter) instead.",
    ),
  )
}

export const TmpFsAdapter = {
  kind: "extracted-dir",
  capabilities: { writable: true },
  init: unavailable,
  initEmpty: unavailable,
} as const satisfies EpubStorageAdapterClass
