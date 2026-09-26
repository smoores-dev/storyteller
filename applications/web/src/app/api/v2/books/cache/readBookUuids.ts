import { type UUID } from "@/uuid"

export async function readBookUuids(request: Request): Promise<UUID[] | null> {
  const body: unknown = await request.json().catch(() => null)

  const rawUuids =
    body && typeof body === "object" && "bookUuids" in body
      ? (body as { bookUuids?: unknown }).bookUuids
      : undefined

  return Array.isArray(rawUuids) && rawUuids.every((u) => typeof u === "string")
    ? (rawUuids as UUID[])
    : null
}
