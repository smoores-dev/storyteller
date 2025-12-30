import { CamelCasePlugin, Kysely, ParseJSONResultsPlugin } from "kysely"

import { logger } from "@/logger"

import { ExpoDialect } from "./dialect"
import { type DB } from "./schema"

export const db = new Kysely<DB>({
  log(event) {
    if (event.level === "error") {
      logger.error(event.query.sql)
      logger.error(event.error)
      return
    }
    logger.trace(event.query.sql)
    logger.trace(event.query.parameters)
    logger.trace(`Completed in ${event.queryDurationMillis}ms`)
  },
  dialect: new ExpoDialect({ database: "storyteller.db" }),
  plugins: [new CamelCasePlugin(), new ParseJSONResultsPlugin()],
})
