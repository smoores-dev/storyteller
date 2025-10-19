import { db } from "@/database/connection"
import { logger } from "@/logging"
import { getReadiumService } from "@/services/readiumService"

export const GET = async () => {
  try {
    const [tablesNames, readiumHealth] = await Promise.all([
      db.introspection.getTables(),
      getReadiumService().checkHealth(),
    ])

    if (tablesNames.length === 0) {
      return new Response(
        JSON.stringify({
          status: "unhealthy",
          message: "Database is not connected",
        }),
        { status: 500 },
      )
    }

    if (!readiumHealth) {
      return new Response(
        JSON.stringify({
          status: "unhealthy",
          message: "Readium service is not running",
        }),
        { status: 500 },
      )
    }
  } catch (_error) {
    logger.error(_error)
    return new Response(
      JSON.stringify({
        status: "unhealthy",
        message: "Failed to check health",
      }),
      { status: 500 },
    )
  }

  return new Response(
    JSON.stringify({
      status: "healthy",
      message: "All services are running",
    }),
    { status: 200 },
  )
}
