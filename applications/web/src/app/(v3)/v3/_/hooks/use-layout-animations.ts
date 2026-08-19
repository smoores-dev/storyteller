"use client"

import { useReducedMotion } from "motion/react"

import { useUserPreferences } from "@v3/_/components/user-preferences-provider"

export function useLayoutAnimations(): boolean {
  const { layoutAnimations } = useUserPreferences()
  const reducedMotion = useReducedMotion()
  return layoutAnimations && !reducedMotion
}
