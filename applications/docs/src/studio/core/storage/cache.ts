import {
  STORES,
  isQuotaError,
  openStudioDb,
  requestToPromise,
  transactionDone,
} from "./idb"

const memory = new Map<string, unknown>()

interface Entry {
  value: unknown
  at: number
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) {
    return memory.get(key) as T
  }

  try {
    const db = await openStudioDb()
    if (!db) {
      return undefined
    }

    const entry = (await requestToPromise(
      db
        .transaction(STORES.cache, "readonly")
        .objectStore(STORES.cache)
        .get(key),
    )) as Entry | undefined
    if (!entry) {
      return undefined
    }

    memory.set(key, entry.value)
    return entry.value as T
  } catch {
    return undefined
  }
}

async function write(key: string, value: unknown) {
  const db = await openStudioDb()
  if (!db) {
    return
  }

  const transaction = db.transaction(STORES.cache, "readwrite")
  transaction
    .objectStore(STORES.cache)
    .put({ value, at: Date.now() } satisfies Entry, key)
  await transactionDone(transaction)
}

async function clearOldest(keep: number) {
  const db = await openStudioDb()
  if (!db) {
    return
  }

  const transaction = db.transaction(STORES.cache, "readwrite")
  const store = transaction.objectStore(STORES.cache)
  const [keys, values] = await Promise.all([
    requestToPromise(store.getAllKeys()),
    requestToPromise(store.getAll()),
  ])
  const order = keys
    .map((key, index) => ({ key, at: (values[index] as Entry).at }))
    .sort((a, b) => b.at - a.at)
  for (const { key } of order.slice(keep)) {
    store.delete(key)
  }

  await transactionDone(transaction)
}

export async function cachePut(key: string, value: unknown): Promise<void> {
  memory.set(key, value)
  try {
    await write(key, value)
  } catch (error) {
    if (!isQuotaError(error)) {
      return
    }

    try {
      await clearOldest(50)
      await write(key, value)
    } catch {
      return
    }
  }
}

export async function cached<T>(
  key: string | null,
  load: () => Promise<T>,
): Promise<T> {
  if (key !== null) {
    const hit = await cacheGet<T>(key)
    if (hit !== undefined) {
      return hit
    }
  }

  const value = await load()
  if (key !== null) {
    void cachePut(key, value)
  }

  return value
}

export function forgetCached(prefix: string) {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) {
      memory.delete(key)
    }
  }
}
