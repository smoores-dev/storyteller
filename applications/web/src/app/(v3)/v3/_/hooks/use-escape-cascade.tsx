"use client"

import { useHotkey } from "@tanstack/react-hotkeys"
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
} from "react"

export const ESCAPE_PRIORITY = {
  stopEditing: 50,
  blurSearch: 40,
  listSelection: 30,
  sidebarSelection: 20,
  closePanel: 10,
} as const

type EscapeHandler = () => unknown

type Entry = { priority: number; handler: EscapeHandler }

type Registry = {
  register: (entry: Entry) => () => void
}

const EscapeCascadeContext = createContext<Registry | null>(null)

export function EscapeCascadeProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef<Set<Entry>>(new Set())

  const registryRef = useRef<Registry | null>(null)
  registryRef.current ??= {
    register: (entry) => {
      entriesRef.current.add(entry)
      return () => {
        entriesRef.current.delete(entry)
      }
    },
  }

  useHotkey(
    "Escape",
    (event) => {
      const entries = [...entriesRef.current].sort(
        (a, b) => b.priority - a.priority,
      )

      for (const entry of entries) {
        if (entry.handler() !== false) {
          event.preventDefault()
          return
        }
      }
    },
    {
      target: typeof window === "undefined" ? null : window,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  )

  return (
    <EscapeCascadeContext.Provider value={registryRef.current}>
      {children}
    </EscapeCascadeContext.Provider>
  )
}

export function useEscapeHandler(
  priority: number,
  handler: EscapeHandler,
  enabled = true,
) {
  const registry = useContext(EscapeCascadeContext)

  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!registry || !enabled) return

    return registry.register({
      priority,
      handler: () => handlerRef.current(),
    })
  }, [registry, priority, enabled])
}
