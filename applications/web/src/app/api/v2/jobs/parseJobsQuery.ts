import { JobsQuerySchemaV2, type JobsQueryV2 } from "@/schemas/v2/job"

export type ParseJobsQueryResult =
  | { ok: true; query: JobsQueryV2 }
  | { ok: false; error: string }

export function parseJobsQuery(
  searchParams: URLSearchParams,
): ParseJobsQueryResult {
  const raw: Record<string, unknown> = {}

  for (const key of [
    "type",
    "bookUuid",
    "search",
    "sort",
    "order",
    "limit",
    "offset",
  ] as const) {
    const value = searchParams.get(key)
    if (value) raw[key] = value
  }

  const statuses = searchParams.get("statuses")
  if (statuses) raw["statuses"] = statuses.split(",").filter(Boolean)

  const validated = JobsQuerySchemaV2.safeParse(raw)
  if (!validated.success) {
    return { ok: false, error: validated.error.message }
  }

  return { ok: true, query: validated.data }
}
