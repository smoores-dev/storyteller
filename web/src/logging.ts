import pino from "pino"

export const logger = pino({
  ...(process.env["STORYTELLER_LOG_FORMAT"] !== "json" && {
    transport: {
      target: "pino-pretty",
      options: {
        ignore: "pid,hostname",
      },
    },
  }),
})
