import { Middleware } from "@reduxjs/toolkit"
import { logger } from "../../logger"

export const crashReportingMiddleware: Middleware =
  (_) => (next) => (action) => {
    try {
      next(action)
    } catch (error) {
      logger.error(error)
      throw error
    }
  }
