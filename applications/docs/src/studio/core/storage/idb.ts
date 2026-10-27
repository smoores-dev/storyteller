const DB_NAME = "docs-studio"
const DB_VERSION = 1

export const STORES = {
  drafts: "drafts",
  draftBlobs: "draftBlobs",
  cache: "cache",
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

let opened: Promise<IDBDatabase | null> | null = null

export function openStudioDb(): Promise<IDBDatabase | null> {
  if (opened) {
    return opened
  }

  opened = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null)
      return
    }

    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name)
        }
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        opened = null
      }

      resolve(db)
    }

    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return opened
}

export function describeStorageError(error: unknown): string {
  if (isQuotaError(error)) {
    return "Your browser has no storage space left for drafts."
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return String(error)
}

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const named = error as { name?: string; code?: number }
  return (
    named.name === "QuotaExceededError" ||
    named.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    named.code === 22 ||
    named.code === 1014
  )
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The storage transaction aborted."))
  })
}
