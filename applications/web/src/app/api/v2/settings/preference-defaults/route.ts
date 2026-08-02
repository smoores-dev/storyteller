import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import {
  isPreferenceDefaultsLocked,
  setPreferenceDefaults,
} from "@/database/settings"
import { PreferenceDefaultsUpdateSchema } from "@/database/userPreferencesTypes"

export const dynamic = "force-dynamic"

/**
 * @summary Update the library-wide default preferences
 */
export const PUT = withHasPermission("settingsUpdate")(async (request) => {
  if (await isPreferenceDefaultsLocked()) {
    return NextResponse.json(
      { error: "Preference defaults are managed by the config file" },
      { status: 423 },
    )
  }

  const body: unknown = await request.json()

  const parsed = PreferenceDefaultsUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid preference defaults" },
      { status: 400 },
    )
  }

  const merged = await setPreferenceDefaults(parsed.data)
  return NextResponse.json(merged)
})
