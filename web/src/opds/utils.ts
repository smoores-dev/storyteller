import { NextResponse } from "next/server"

import { getSettings } from "@/database/settings"

export async function getOPDSConfig() {
  const settings = await getSettings()

  return {
    enabled: settings.opdsEnabled,
    pageSize: settings.opdsPageSize,
  }
}

export function createOPDSResponse(
  xml: string,
  kind: "navigation" | "acquisition",
) {
  return new NextResponse(xml, {
    headers: {
      "Content-Type": `application/atom+xml;profile=opds-catalog;kind=${kind}`,
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
