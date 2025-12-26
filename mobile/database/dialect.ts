import * as SQLite from "expo-sqlite"
import { type SQLiteDatabase } from "expo-sqlite"
import {
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely"

import { logger } from "@/logger"

import { deserialize as autoAffinityDeserialize } from "./converters/autoAffinityDeserialize"
import { serialize } from "./converters/serialize"

export type ExpoDialectConfig = {
  // Name of the database file or the database object.
  database: string | SQLiteDatabase
  onError?: (message: string, exception: unknown) => void
}

/**
 * Expo dialect for Kysely.
 */
export class ExpoDialect implements Dialect {
  config: ExpoDialectConfig

  constructor(config: ExpoDialectConfig) {
    this.config = config
  }

  createDriver(): ExpoDriver {
    return new ExpoDriver(this.config)
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler()
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter()
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db)
  }
}

/**
 * Expo driver for Kysely.
 */
export class ExpoDriver implements Driver {
  readonly #connectionMutex = new ConnectionMutex()
  readonly #connection: ExpoConnection

  constructor(config: ExpoDialectConfig) {
    this.#connection = new ExpoConnection(config)
  }

  async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock()
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<ExpoConnection> {
    await this.#connectionMutex.lock()
    return this.#connection
  }

  async beginTransaction(connection: ExpoConnection): Promise<void> {
    await connection.directQuery("begin transaction")
  }

  async commitTransaction(connection: ExpoConnection): Promise<void> {
    await connection.directQuery("commit")
  }

  async rollbackTransaction(connection: ExpoConnection): Promise<void> {
    await connection.directQuery("rollback")
  }

  async destroy(): Promise<void> {
    await this.#connection.closeConnection()
  }

  async getDatabaseRuntimeVersion() {
    try {
      const res = await this.#connection.directQuery(
        "select sqlite_version() as version;",
      )
      return (res[0] as { version: number }).version
    } catch (e) {
      console.error(e)
      return "unknown"
    }
  }
}

/**
 * Expo connection for Kysely.
 */
class ExpoConnection implements DatabaseConnection {
  sqlite: SQLite.SQLiteDatabase
  config: ExpoDialectConfig

  constructor(config: ExpoDialectConfig) {
    if (typeof config.database === "string") {
      this.sqlite = SQLite.openDatabaseSync(config.database)
    } else {
      this.sqlite = config.database
    }

    this.config = config
    this.sqlite.execSync("PRAGMA foreign_keys = ON;")
  }

  async closeConnection(): Promise<void> {
    return this.sqlite.closeAsync()
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { parameters, query } = compiledQuery
    let { sql } = compiledQuery

    // Kysely uses varchar(255) as the default string type for migrations which is not supported by STRICT mode.
    if (
      query.kind === "CreateTableNode" &&
      !sql.includes("kysely_migration") &&
      !sql.includes("kysely_migration_lock") &&
      !sql.includes("STRICT")
    ) {
      sql += " STRICT"
    }

    const readonly =
      query.kind === "SelectQueryNode" || query.kind === "RawNode"

    // Check if the query has a RETURNING clause
    const hasReturning = sql.toUpperCase().includes("RETURNING")

    const transformedParameters = serialize([...parameters])

    logger.debug(`${query.kind}${readonly ? " (readonly)" : ""}: ${sql}`)

    if (readonly || hasReturning) {
      const res = await this.sqlite.getAllAsync<R>(sql, transformedParameters)

      const skip =
        query.kind === "SelectQueryNode" &&
        (sql.includes("preferences") ||
          sql.includes("bookPreferences") ||
          sql.includes("pragma_table_info")) // @todo: fix this hack - find a better way

      if (!skip) {
        return {
          rows: autoAffinityDeserialize(res, this.config.onError),
          // Add these properties for non-readonly queries with RETURNING
          ...(hasReturning && !readonly
            ? {
                numAffectedRows: BigInt(0), // We don't know this value
                insertId: BigInt(0), // We don't know this value
              }
            : {}),
        } satisfies QueryResult<R>
      }

      return {
        rows: res,
        // Add these properties for non-readonly queries with RETURNING
        ...(hasReturning && !readonly
          ? {
              numAffectedRows: BigInt(0), // We don't know this value
              insertId: BigInt(0), // We don't know this value
            }
          : {}),
      } satisfies QueryResult<R>
    } else {
      const res = await this.sqlite.runAsync(sql, transformedParameters)

      const queryResult = {
        numAffectedRows: BigInt(res.changes),
        insertId: BigInt(res.lastInsertRowId),
        rows: [],
      } satisfies QueryResult<R>

      logger.debug("queryResult", queryResult)

      return queryResult
    }
  }

  async directQuery<T>(query: string): Promise<Array<T>> {
    return await this.sqlite.getAllAsync<T>(query, [])
  }

  streamQuery<R>(
    _compiledQuery: CompiledQuery,
    _chunkSize?: number,
  ): AsyncIterableIterator<QueryResult<R>> {
    throw new Error(
      "Expo SQLite driver does not support iterate on prepared statements",
    )
  }
}

class ConnectionMutex {
  #promise?: Promise<void> | undefined
  #resolve?: (() => void) | undefined

  async lock(): Promise<void> {
    while (this.#promise) {
      await this.#promise
    }

    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve
    })
  }

  unlock(): void {
    const resolve = this.#resolve

    this.#promise = undefined
    this.#resolve = undefined

    resolve?.()
  }
}
