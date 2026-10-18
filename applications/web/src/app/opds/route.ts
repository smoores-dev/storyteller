import { buildRootCatalog } from "@/opds/builders"
import { handleOpds, opdsOptions } from "@/opds/respond"

export const dynamic = "force-dynamic"

// backup v1 catalog entry point
export const GET = handleOpds((ctx) => buildRootCatalog(ctx))

export const OPTIONS = opdsOptions
