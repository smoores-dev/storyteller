import { SEARCH_PARAM, buildSearchResults } from "@/opds/builders"
import { handleOpds, opdsOptions } from "@/opds/respond"

export const dynamic = "force-dynamic"

export const GET = handleOpds((ctx) =>
  buildSearchResults(ctx, ctx.params.get(SEARCH_PARAM)),
)

export const OPTIONS = opdsOptions
