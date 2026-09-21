import { recomputeAlignmentSummaries } from "@/database/alignmentReports"
import { logger } from "@/logging"

export default async function migrate() {
  const count = await recomputeAlignmentSummaries(null)
  logger.info({ msg: `Regraded ${count} alignment reports` })
}
