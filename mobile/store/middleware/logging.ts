import { Middleware } from "@reduxjs/toolkit"
import { logger } from "../../logger"

function shallowStringify(value: unknown) {
  return JSON.stringify(value, function (k, v) {
    if (!k) return v

    if (k === "password" || k === "accessToken") return "**********"

    if (typeof v !== "number") {
      if (Array.isArray(v)) {
        return "[object Array]"
      }
      return String(v)
    }

    return v
  })
}

export const loggingMiddleware: Middleware = (_) => (next) => (action) => {
  logger.debug(
    `Dispatching action: ${action.type} - ${shallowStringify(action.payload)}`,
  )
  next(action)
}
