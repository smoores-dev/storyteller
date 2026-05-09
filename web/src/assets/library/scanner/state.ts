import { AsyncMutex } from "@esfx/async-mutex"

import { type ScanSource } from "./ctx"
import { type ScanReport } from "./scanReport"

export type ScanState = {
  running: boolean
  source: ScanSource | null
  startedAt: number | null
  progress: { processed: number; total: number } | null
  pendingSources: ScanSource[]
}

type Mutable = {
  lock: AsyncMutex
  activeController: AbortController | null
  pendingSources: ScanSource[]
  recent: ScanReport[]
  state: ScanState
}

const RECENT_LIMIT = 25

function initialState(): Mutable {
  return {
    lock: new AsyncMutex(),
    activeController: null,
    pendingSources: [],
    recent: [],
    state: {
      running: false,
      source: null,
      startedAt: null,
      progress: null,
      pendingSources: [],
    },
  }
}

declare global {
  // eslint-disable-next-line no-var
  var libraryScanState: Mutable | undefined
}

function get(): Mutable {
  if (!globalThis.libraryScanState) {
    globalThis.libraryScanState = initialState()
  }
  return globalThis.libraryScanState
}

export function getScanState(): ScanState {
  const s = get().state
  return {
    ...s,
    progress: s.progress ? { ...s.progress } : null,
    pendingSources: [...s.pendingSources],
  }
}

export function getRecentScanReports() {
  return get().recent.map((report) => report.toJSON())
}

export async function withScanLock<T>(
  source: ScanSource,
  startedAt: number,
  controller: AbortController | null,
  run: (setProgress: (processed: number, total: number) => void) => Promise<T>,
): Promise<T | null> {
  const m = get()

  if (m.lock.isLocked) {
    m.pendingSources.push(source)
    syncPending(m)
  }

  await m.lock.lock()

  const pendingIndex = m.pendingSources.indexOf(source)
  if (pendingIndex >= 0) {
    m.pendingSources.splice(pendingIndex, 1)
    syncPending(m)
  }

  m.activeController = controller

  m.state = {
    ...m.state,
    running: true,
    source,
    startedAt,
    progress: null,
  }

  try {
    return await run((processed, total) => {
      m.state = { ...m.state, progress: { processed, total } }
    })
  } finally {
    m.activeController = null

    m.state = {
      ...m.state,
      running: false,
      source: null,
      startedAt: null,
      progress: null,
    }

    m.lock.unlock()
  }
}

export function pushRecentReport(report: ScanReport) {
  const m = get()
  m.recent.push(report)
  if (m.recent.length > RECENT_LIMIT) {
    m.recent.splice(0, m.recent.length - RECENT_LIMIT)
  }
}

export function cancelActiveScan(): boolean {
  const m = get()

  if (!m.activeController) {
    return false
  }

  m.activeController.abort()
  return true
}

function syncPending(m: Mutable) {
  m.state = { ...m.state, pendingSources: [...m.pendingSources] }
}
