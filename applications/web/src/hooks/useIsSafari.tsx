"use client"

import { isSafari } from "@/reader/helpers"

/**
 * 🛎️ shame
 */
export const useIsSafari = (): {
  isSafari: boolean
} => {
  if (typeof window === "undefined") {
    return { isSafari: false }
  }

  const safari = isSafari(window)
  return {
    isSafari: safari,
  }
}
