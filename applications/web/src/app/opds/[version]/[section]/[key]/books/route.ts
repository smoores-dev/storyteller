import { OPDS_SECTION_PATHS } from "@/facet-sections"
import { buildSectionBooks } from "@/opds/builders"
import { handleOpds, opdsOptions } from "@/opds/respond"

export const dynamic = "force-dynamic"

export const GET = handleOpds(async (ctx, params) => {
  const section = OPDS_SECTION_PATHS[params["section"] ?? ""]
  return section ? buildSectionBooks(ctx, section, params["key"] ?? "") : null
})

export const OPTIONS = opdsOptions
