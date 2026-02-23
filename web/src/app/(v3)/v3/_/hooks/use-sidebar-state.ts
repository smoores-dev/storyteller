import { useCallback, useSyncExternalStore } from "react"

const STORAGE_KEY = "storyteller-sidebar-state"

type SidebarState = {
  // map of sectionId -> explicit open state (true = open, false = closed)
  // if a section is not in this map, it uses the default behavior
  explicitState: Record<string, boolean>
}

const defaultState: SidebarState = {
  explicitState: {},
}

let cachedState: SidebarState | null = null
const listeners = new Set<() => void>()

function getState(): SidebarState {
  if (typeof window === "undefined") return defaultState
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as SidebarState
    }
  } catch {
    // ignore
  }
  return defaultState
}

function saveState(state: SidebarState): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function notifyListeners() {
  cachedState = null
  listeners.forEach((listener) => {
    listener()
  })
}

function getSnapshot(): SidebarState {
  if (cachedState === null) {
    cachedState = getState()
  }
  return cachedState
}

function getServerSnapshot(): SidebarState {
  return defaultState
}

export function useSidebarState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const isSectionOpen = useCallback(
    (sectionId: string, defaultOpen: boolean) => {
      const explicit = state.explicitState[sectionId]
      if (explicit !== undefined) {
        return explicit
      }
      return defaultOpen
    },
    [state.explicitState],
  )

  const setSectionOpen = useCallback((sectionId: string, open: boolean) => {
    const current = getState()
    saveState({
      ...current,
      explicitState: {
        ...current.explicitState,
        [sectionId]: open,
      },
    })
    notifyListeners()
  }, [])

  return {
    isSectionOpen,
    setSectionOpen,
  }
}
