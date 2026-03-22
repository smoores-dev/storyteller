import { NextResponse } from "next/server"

import { withHasPermission } from "@/auth/auth"
import { getConfigLockedKeys } from "@/database/settings"

export const dynamic = "force-dynamic"

/**
 * @summary Get settings keys locked by the config file
 * @desc Returns the list of setting keys that are managed via a
 *   declarative configuration file and cannot be changed through the API.
 */
export const GET = withHasPermission("settingsUpdate")(() =>
  NextResponse.json([...getConfigLockedKeys()]),
)
