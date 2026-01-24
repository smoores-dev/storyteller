import { open } from "@op-engineering/op-sqlite"
import { CamelCasePlugin, Kysely, ParseJSONResultsPlugin } from "kysely"

import { logger } from "@/logger"

import { OpSqliteDialect } from "./dialect"
import { type DB } from "./schema"

export const rawDb = open({ name: "storyteller.db" })

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
  dialect: new OpSqliteDialect({
    database: rawDb,
  }),
  plugins: [new CamelCasePlugin(), new ParseJSONResultsPlugin()],
})
