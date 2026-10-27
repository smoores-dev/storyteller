import {
  type BaseFile,
  type Change,
  type ChangesetData,
  draftKey,
  emptyChangeset,
} from "../model/changeset"

import {
  STORES,
  describeStorageError,
  isQuotaError,
  openStudioDb,
  requestToPromise,
  transactionDone,
} from "./idb"

export type StoredChange =
  | Exclude<Change, { kind: "binary" }>
  | { kind: "binary"; mime: string; base: BaseFile }

export interface DraftRecord {
  version: 2
  projectId: number
  branch: string
  headSha: string | null
  createdAt: number
  updatedAt: number
  changes: Record<string, StoredChange>
}

export interface DraftWrite {
  record: DraftRecord
  putBlobs: Map<string, Blob>
  removeBlobs: string[]
}

export interface DraftBackend {
  read(
    key: string,
  ): Promise<{ record: DraftRecord; blobs: Map<string, Blob> } | null>
  write(key: string, write: DraftWrite): Promise<void>
  remove(key: string): Promise<void>
  list(): Promise<DraftRecord[]>
}

export class StorageUnavailableError extends Error {
  constructor() {
    super("This browser does not allow the studio to store drafts.")
  }
}

const BLOB_SEPARATOR = "\u0000"

function blobKey(key: string, path: string) {
  return `${key}${BLOB_SEPARATOR}${path}`
}

export function normalizeBase(base: BaseFile): BaseFile {
  return base.lastCommitId === ""
    ? { content: base.content, lastCommitId: null }
    : base
}

export function splitDraft(
  data: ChangesetData,
  saved: ReadonlyMap<string, Blob>,
  now: number,
): { write: DraftWrite; nextSaved: Map<string, Blob> } {
  const changes: Record<string, StoredChange> = {}
  const putBlobs = new Map<string, Blob>()
  const nextSaved = new Map<string, Blob>()
  for (const [path, change] of Object.entries(data.changes)) {
    if (change.kind === "binary") {
      changes[path] = { kind: "binary", mime: change.mime, base: change.base }
      nextSaved.set(path, change.blob)
      if (saved.get(path) !== change.blob) {
        putBlobs.set(path, change.blob)
      }
    } else {
      changes[path] = change
    }
  }

  const removeBlobs = [...saved.keys()].filter((path) => !nextSaved.has(path))
  return {
    write: {
      record: {
        version: 2,
        projectId: data.projectId,
        branch: data.branch,
        headSha: data.headSha,
        createdAt: data.createdAt,
        updatedAt: now,
        changes,
      },
      putBlobs,
      removeBlobs,
    },
    nextSaved,
  }
}

export function joinDraft(
  record: DraftRecord,
  blobs: ReadonlyMap<string, Blob>,
): ChangesetData {
  const changes: ChangesetData["changes"] = {}
  for (const [path, change] of Object.entries(record.changes)) {
    if (change.kind === "binary") {
      const blob = blobs.get(path)
      if (!blob) {
        continue
      }

      changes[path] = {
        kind: "binary",
        blob,
        mime: change.mime,
        base: normalizeBase(change.base),
      }
    } else {
      changes[path] = { ...change, base: normalizeBase(change.base) }
    }
  }

  return {
    version: 1,
    projectId: record.projectId,
    branch: record.branch,
    headSha: record.headSha,
    createdAt: record.createdAt,
    changes,
  }
}

export class MemoryDraftBackend implements DraftBackend {
  readonly records = new Map<string, DraftRecord>()
  readonly blobs = new Map<string, Blob>()
  failWith: Error | null = null

  async read(key: string) {
    const record = this.records.get(key)
    if (!record) {
      return null
    }

    const blobs = new Map<string, Blob>()
    for (const [stored, blob] of this.blobs) {
      if (stored.startsWith(`${key}${BLOB_SEPARATOR}`)) {
        blobs.set(stored.slice(key.length + 1), blob)
      }
    }

    return { record, blobs }
  }

  async write(key: string, write: DraftWrite) {
    if (this.failWith) {
      throw this.failWith
    }

    this.records.set(key, write.record)
    for (const [path, blob] of write.putBlobs) {
      this.blobs.set(blobKey(key, path), blob)
    }

    for (const path of write.removeBlobs) {
      this.blobs.delete(blobKey(key, path))
    }
  }

  async remove(key: string) {
    if (this.failWith) {
      throw this.failWith
    }

    this.records.delete(key)
    for (const stored of [...this.blobs.keys()]) {
      if (stored.startsWith(`${key}${BLOB_SEPARATOR}`)) {
        this.blobs.delete(stored)
      }
    }
  }

  async list() {
    return [...this.records.values()]
  }
}

export class IdbDraftBackend implements DraftBackend {
  private async db() {
    const db = await openStudioDb()
    if (!db) {
      throw new StorageUnavailableError()
    }

    return db
  }

  async read(key: string) {
    const db = await this.db()
    const transaction = db.transaction(
      [STORES.drafts, STORES.draftBlobs],
      "readonly",
    )
    const record = (await requestToPromise(
      transaction.objectStore(STORES.drafts).get(key),
    )) as DraftRecord | undefined
    if (!record) {
      return null
    }

    const range = IDBKeyRange.bound(
      `${key}${BLOB_SEPARATOR}`,
      `${key}${BLOB_SEPARATOR}￿`,
    )
    const store = transaction.objectStore(STORES.draftBlobs)
    const [keys, values] = await Promise.all([
      requestToPromise(store.getAllKeys(range)),
      requestToPromise(store.getAll(range)),
    ])
    const blobs = new Map<string, Blob>()
    keys.forEach((stored, index) => {
      blobs.set(String(stored).slice(key.length + 1), values[index] as Blob)
    })
    return { record, blobs }
  }

  async write(key: string, write: DraftWrite) {
    const db = await this.db()
    const transaction = db.transaction(
      [STORES.drafts, STORES.draftBlobs],
      "readwrite",
    )
    const blobs = transaction.objectStore(STORES.draftBlobs)
    for (const [path, blob] of write.putBlobs) {
      blobs.put(blob, blobKey(key, path))
    }

    for (const path of write.removeBlobs) {
      blobs.delete(blobKey(key, path))
    }

    transaction.objectStore(STORES.drafts).put(write.record, key)
    await transactionDone(transaction)
  }

  async remove(key: string) {
    const db = await this.db()
    const transaction = db.transaction(
      [STORES.drafts, STORES.draftBlobs],
      "readwrite",
    )
    transaction.objectStore(STORES.drafts).delete(key)
    transaction
      .objectStore(STORES.draftBlobs)
      .delete(
        IDBKeyRange.bound(
          `${key}${BLOB_SEPARATOR}`,
          `${key}${BLOB_SEPARATOR}￿`,
        ),
      )
    await transactionDone(transaction)
  }

  async list() {
    const db = await this.db()
    const transaction = db.transaction(STORES.drafts, "readonly")
    return (await requestToPromise(
      transaction.objectStore(STORES.drafts).getAll(),
    )) as DraftRecord[]
  }
}

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; message: string; quota: boolean }
  | { status: "unavailable"; message: string }

interface LegacyChange {
  kind: string
  base64?: string
  mime?: string
  base?: BaseFile
  [key: string]: unknown
}

export function legacyKey(projectId: number, branch: string) {
  return `studio:draft:${projectId}:${branch}`
}

function decodeBase64(base64: string, mime: string): Blob {
  const binary = atob(base64.replace(/\s/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new Blob([bytes], { type: mime })
}

export function fromLegacyDraft(
  raw: unknown,
  projectId: number,
  branch: string,
): ChangesetData | null {
  if (!raw || typeof raw !== "object") {
    return null
  }

  const parsed = raw as {
    version?: number
    headSha?: string | null
    createdAt?: number
    changes?: Record<string, LegacyChange>
  }
  if (!parsed.changes || typeof parsed.changes !== "object") {
    return null
  }

  const changes: ChangesetData["changes"] = {}
  for (const [path, change] of Object.entries(parsed.changes)) {
    if (!change || typeof change !== "object") {
      continue
    }

    const base = normalizeBase(
      change.base ?? { content: null, lastCommitId: null },
    )
    if (change.kind === "binary") {
      if (typeof change.base64 !== "string") {
        continue
      }

      const mime = change.mime || "image/png"
      changes[path] = {
        kind: "binary",
        blob: decodeBase64(change.base64, mime),
        mime,
        base,
      }
    } else if (change.kind === "text" || change.kind === "move") {
      changes[path] = { ...change, base } as ChangesetData["changes"][string]
    } else if (change.kind === "delete") {
      changes[path] = { kind: "delete", base }
    }
  }

  return {
    version: 1,
    projectId,
    branch,
    headSha: parsed.headSha ?? null,
    createdAt: parsed.createdAt ?? Date.now(),
    changes,
  }
}

function readLegacy(projectId: number, branch: string): ChangesetData | null {
  try {
    const raw = localStorage.getItem(legacyKey(projectId, branch))
    if (!raw) {
      return null
    }

    return fromLegacyDraft(JSON.parse(raw), projectId, branch)
  } catch {
    return null
  }
}

function dropLegacy(projectId: number, branch: string) {
  try {
    localStorage.removeItem(legacyKey(projectId, branch))
  } catch {
    return
  }
}

export class DraftPersistence {
  private saved = new Map<string, Map<string, Blob>>()
  private pending: ChangesetData | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> = Promise.resolve()
  private listeners = new Set<() => void>()
  private failed: ChangesetData | null = null
  private requestedPersistence = false
  private current: SaveState = { status: "idle" }

  constructor(
    private readonly backend: DraftBackend,
    private readonly delay = 400,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.current

  private setState(next: SaveState) {
    this.current = next
    for (const listener of this.listeners) {
      listener()
    }
  }

  hasUnsavedWork() {
    const filled = (data: ChangesetData | null) =>
      data !== null && Object.keys(data.changes).length > 0
    return filled(this.pending) || filled(this.failed)
  }

  async load(projectId: number, branch: string): Promise<ChangesetData> {
    const key = draftKey(projectId, branch)
    try {
      const stored = await this.backend.read(key)
      if (stored) {
        const data = joinDraft(stored.record, stored.blobs)
        this.remember(data)
        dropLegacy(projectId, branch)
        return data
      }
    } catch (error) {
      this.fail(error)
    }

    const legacy = readLegacy(projectId, branch)
    if (legacy && Object.keys(legacy.changes).length > 0) {
      const migrated = await this.persist(legacy)
      if (migrated) {
        dropLegacy(projectId, branch)
      }

      return legacy
    }

    return emptyChangeset(projectId, branch, null)
  }

  private remember(data: ChangesetData) {
    const blobs = new Map<string, Blob>()
    for (const [path, change] of Object.entries(data.changes)) {
      if (change.kind === "binary") {
        blobs.set(path, change.blob)
      }
    }

    this.saved.set(draftKey(data.projectId, data.branch), blobs)
  }

  schedule(data: ChangesetData) {
    if (
      this.pending &&
      (this.pending.projectId !== data.projectId ||
        this.pending.branch !== data.branch)
    ) {
      void this.flush()
    }

    this.pending = data
    if (this.timer === null) {
      this.timer = setTimeout(() => void this.flush(), this.delay)
    }
  }

  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }

    this.timer = null
    const data = this.pending
    this.pending = null
    if (!data) {
      return this.chain
    }

    this.setState({ status: "saving" })
    this.chain = this.chain.then(async () => {
      const ok = await this.persist(data)
      if (!ok && this.pending === null) {
        this.pending = data
      }
    })
    return this.chain
  }

  async retry() {
    const data = this.pending
    if (data) {
      await this.flush()
    }

    return this.current.status !== "error"
  }

  private async persist(data: ChangesetData): Promise<boolean> {
    const key = draftKey(data.projectId, data.branch)
    try {
      if (Object.keys(data.changes).length === 0) {
        await this.backend.remove(key)
        this.saved.delete(key)
      } else {
        this.requestPersistentStorage()
        const { write, nextSaved } = splitDraft(
          data,
          this.saved.get(key) ?? new Map(),
          Date.now(),
        )
        await this.backend.write(key, write)
        this.saved.set(key, nextSaved)
      }

      this.failed = null
      if (this.pending === null && this.timer === null) {
        this.setState({ status: "saved", at: Date.now() })
      }

      return true
    } catch (error) {
      this.failed = data
      this.fail(error)
      return false
    }
  }

  private fail(error: unknown) {
    if (error instanceof StorageUnavailableError) {
      this.setState({ status: "unavailable", message: error.message })
      return
    }

    this.setState({
      status: "error",
      message: describeStorageError(error),
      quota: isQuotaError(error),
    })
  }

  private requestPersistentStorage() {
    if (this.requestedPersistence) {
      return
    }

    this.requestedPersistence = true
    try {
      void navigator.storage?.persist?.()
    } catch {
      return
    }
  }

  list() {
    return this.backend.list()
  }
}

let shared: DraftPersistence | null = null

export function draftPersistence(): DraftPersistence {
  if (!shared) {
    shared = new DraftPersistence(new IdbDraftBackend())
    if (typeof window !== "undefined") {
      const flush = () => void shared?.flush()
      window.addEventListener("pagehide", flush)
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          flush()
        }
      })
      window.addEventListener("beforeunload", (event) => {
        flush()
        if (shared?.hasUnsavedWork()) {
          event.preventDefault()
          event.returnValue = ""
        }
      })
    }
  }

  return shared
}
