import { NextResponse } from "next/server"

import { ATOM_ACQ, ATOM_NAV } from "@storyteller-platform/opds"

import { getSettings } from "@/database/settings"
import { SETTINGS_DEFAULTS } from "@/database/settingsTypes"

export async function getOPDSConfig() {
  const settings = await getSettings()

  return {
    enabled: settings.opdsEnabled,
    pageSize: settings.opdsPageSize,
    formats: settings.opdsFormats,
    sort: {
      field: settings.opdsSortField ?? SETTINGS_DEFAULTS.opdsSortField,
      direction:
        settings.opdsSortDirection ?? SETTINGS_DEFAULTS.opdsSortDirection,
    },
  }
}

export function createOPDSResponse(
  xml: string,
  kind: "navigation" | "acquisition",
) {
  return new NextResponse(xml, {
    headers: {
      "Content-Type": kind === "navigation" ? ATOM_NAV : ATOM_ACQ,
      "Cache-Control": "private, max-age=300",
    },
  })
}
