import { type NextRequest } from "next/server"

import { getReadiumService } from "@/services/readiumService"

export async function GET(_request: NextRequest) {
  try {
    const readiumService = getReadiumService()

    if (!readiumService.isRunning()) {
      return Response.json(
        {
          status: "unhealthy",
          message: "Readium service is not running",
          port: readiumService.getPort(),
        },
        { status: 503 },
      )
    }

    const isHealthy = await readiumService.checkHealth()

    if (!isHealthy) {
      return Response.json(
        {
          status: "unhealthy",
          message: "Readium service health check failed",
          port: readiumService.getPort(),
        },
        { status: 503 },
      )
    }

    return Response.json({
      status: "healthy",
      message: "Readium service is running",
      port: readiumService.getPort(),
    })
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: "Failed to check Readium service health",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
