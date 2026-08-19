import { db } from "@/database/connection"
import { logger } from "@/logging"

export type LegacyFilterNode = {
  type: string
  field?: string
  value?: unknown
  child?: LegacyFilterNode
  children?: LegacyFilterNode[]
}

export function rewrite(node: LegacyFilterNode): boolean {
  let changed = false

  if (node.type === "condition") {
    if (node.field === "mediaType") {
      node.field = "format"
      changed = true
    }

    if (node.field === "format") {
      if (node.value === "synced") {
        node.value = "readaloud"
        changed = true
      } else if (Array.isArray(node.value) && node.value.includes("synced")) {
        node.value = (node.value as unknown[]).map((v) =>
          v === "synced" ? "readaloud" : v,
        )
        changed = true
      }
    }

    return changed
  }

  if (node.child) changed = rewrite(node.child) || changed
  for (const child of node.children ?? []) {
    changed = rewrite(child) || changed
  }

  return changed
}

export default async function migrate() {
  const shelves = await db
    .selectFrom("shelf")
    .select(["uuid", "filter"])
    .where("filter", "is not", null)
    .execute()

  for (const shelf of shelves) {
    let filter: LegacyFilterNode
    try {
      filter =
        typeof shelf.filter === "string"
          ? (JSON.parse(shelf.filter) as LegacyFilterNode)
          : (shelf.filter as unknown as LegacyFilterNode)
    } catch (err) {
      logger.warn({
        msg: `Skipping shelf ${shelf.uuid} with unparseable filter`,
        err,
      })
      continue
    }

    if (!rewrite(filter)) continue

    await db
      .updateTable("shelf")
      .set({ filter: JSON.stringify(filter) })
      .where("uuid", "=", shelf.uuid)
      .execute()
  }
}
