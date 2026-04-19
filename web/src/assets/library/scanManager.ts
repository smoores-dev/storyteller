import { AsyncMutex } from "@esfx/async-mutex"

import { getCollections } from "@/database/collections"
import { getSetting } from "@/database/settings"
import { type UUID } from "@/uuid"

import { scan } from "./scan"

type ScanSource = "watcher" | "manual" | "scheduled"

type ScanState = {
  running: boolean
  source: ScanSource | null
  startedAt: number | null
}

const lock = new AsyncMutex()
const state: ScanState = {
  running: false,
  source: null,
  startedAt: null,
}

function getImportTargets(
  rootImportPaths: string[] | null,
  collections: Awaited<ReturnType<typeof getCollections>>,
) {
  const targets: { importPath: string; collectionUuid: UUID | null }[] = []

  if (rootImportPaths) {
    for (const importPath of rootImportPaths) {
      targets.push({ importPath, collectionUuid: null })
    }
  }

  for (const collection of collections) {
    if (!collection.importPath) {
      continue
    }

    targets.push({
      importPath: collection.importPath,
      collectionUuid: collection.uuid,
    })
  }

  return targets
}

export async function runExclusive(
  source: ScanSource,
  signal: AbortSignal,
  callback: () => Promise<void>,
) {
  await lock.lock()
  if (signal.aborted) {
    lock.unlock()
    return
  }

  state.running = true
  state.source = source
  state.startedAt = Date.now()

  try {
    await callback()
  } finally {
    state.running = false
    state.source = null
    state.startedAt = null
    lock.unlock()
  }
}

export async function runImportScans(signal: AbortSignal): Promise<Set<UUID>> {
  const [rootImportPaths, collections] = await Promise.all([
    getSetting("importPath"),
    getCollections(),
  ])
  const targets = getImportTargets(rootImportPaths, collections)

  const scannedUuids = new Set<UUID>()
  for (const target of targets) {
    if (signal.aborted) {
      return scannedUuids
    }

    const uuids = await scan(target.importPath, target.collectionUuid, signal)
    for (const uuid of uuids) {
      scannedUuids.add(uuid)
    }
  }

  return scannedUuids
}

export function getScanState(): ScanState {
  return { ...state }
}
