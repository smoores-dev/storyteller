"use client"

import { createContext, useContext } from "react"

export type PanelResizeState = {
  live: boolean
  pendingWidthDelta: number
  sliding: boolean
}

const IDLE: PanelResizeState = {
  live: false,
  pendingWidthDelta: 0,
  sliding: false,
}

const PanelResizeContext = createContext<PanelResizeState>(IDLE)

export const PanelResizeProvider = PanelResizeContext.Provider

export function usePanelResize(): PanelResizeState {
  return useContext(PanelResizeContext)
}
