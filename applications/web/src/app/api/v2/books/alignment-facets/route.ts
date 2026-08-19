import { withHasPermission } from "@/auth/auth"
import { getAlignmentFacets } from "@/database/alignmentReports"

export const dynamic = "force-dynamic"

/**
 * @summary Alignment grade facet counts
 * @desc Book counts per alignment grade plus the muted-chapter tally, backing
 * the quality view's grade chips and muted filter.
 */
export const GET = withHasPermission("bookProcess")(async () => {
  const facets = await getAlignmentFacets()
  return Response.json(facets)
})
