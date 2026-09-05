import { NextResponse } from "next/server"

import { ATOM_ACQ, ATOM_NAV } from "@storyteller-platform/opds"

import { getSettings } from "@/database/settings"

export async function getOPDSConfig() {
  const settings = await getSettings()

  return {
    enabled: settings.opdsEnabled,
    pageSize: settings.opdsPageSize,
    format: settings.opdsFormat ?? "readaloud",
  }
}

export function createOPDSResponse(
  xml: string,
  kind: "navigation" | "acquisition",
) {
  return new NextResponse(xml, {
    headers: {
      "Content-Type": kind === "navigation" ? ATOM_NAV : ATOM_ACQ,
      "Cache-Control": "public, max-age=300",
    },
  })
}

export function opdsPaginationOptions(
  pageSize: number | null,
  page: number,
  selfUrl: string,
) {
  if (!pageSize) return undefined

  return {
    currentPage: page,
    pageSize,
    selfUrl,
  }
}
