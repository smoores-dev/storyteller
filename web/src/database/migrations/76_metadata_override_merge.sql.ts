import { db } from "@/database/connection"

type ModeMap = Record<string, string>

function rewrite(value: unknown): ModeMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const map = value as Record<string, unknown>
  const out: ModeMap = {}
  let changed = false
  for (const [field, mode] of Object.entries(map)) {
    if (typeof mode !== "string") continue
    if (mode === "fill-empty") {
      out[field] = "merge"
      changed = true
    } else {
      out[field] = mode
    }
  }
  return changed ? out : null
}

export default async function migrate() {
  const row = await db
    .selectFrom("settings")
    .select(["value"])
    .where("name", "=", "metadataFieldOverrides")
    .executeTakeFirst()

  if (!row) return

  const parsed =
    typeof row.value === "string" ? (JSON.parse(row.value) as unknown) : null

  const next = rewrite(parsed)
  if (!next) return

  await db
    .updateTable("settings")
    .set({ value: JSON.stringify(next) })
    .where("name", "=", "metadataFieldOverrides")
    .execute()
}
