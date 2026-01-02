import type { DB as OpSqliteDatabase, Scalar } from "@op-engineering/op-sqlite"
import {
  CompiledQuery,
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

export type OpSqliteDialectConfig = {
  // Name of the database file or the database object.
  database: OpSqliteDatabase
  onError?: (message: string, exception: unknown) => void
}

/**
 * Expo dialect for Kysely.
 */
export class OpSqliteDialect implements Dialect {
  readonly #config: OpSqliteDialectConfig

  constructor(config: OpSqliteDialectConfig) {
    this.#config = config
  }

  createDriver(): OpSqliteDriver {
    return new OpSqliteDriver(this.#config)
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
export class OpSqliteDriver implements Driver {
  readonly #config: OpSqliteDialectConfig
  readonly #connectionMutex = new ConnectionMutex()

  #connection?: DatabaseConnection

  constructor(config: OpSqliteDialectConfig) {
    this.#config = Object.freeze({ ...config })
  }

  async releaseConnection(): Promise<void> {
    this.#connectionMutex.unlock()
  }

  async init(): Promise<void> {
    this.#connection = new OpSqliteConnection(this.#config)
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    await this.#connectionMutex.lock()
    return this.#connection!
  }

  async beginTransaction(connection: OpSqliteConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("begin"))
  }

  async commitTransaction(connection: OpSqliteConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("commit"))
  }

  async rollbackTransaction(connection: OpSqliteConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("rollback"))
  }

  async destroy(): Promise<void> {
    this.#config.database.close()
  }

  async getDatabaseRuntimeVersion() {
    try {
      const res = await this.#connection?.executeQuery<{ version: number }>(
        CompiledQuery.raw("select sqlite_version() as version;"),
      )
      return res?.rows[0]?.version
    } catch (e) {
      console.error(e)
      return "unknown"
    }
  }
}

/**
 * Expo connection for Kysely.
 */
class OpSqliteConnection implements DatabaseConnection {
  readonly #config: OpSqliteDialectConfig

  constructor(config: OpSqliteDialectConfig) {
    this.#config = config
    this.#config.database.executeSync("PRAGMA foreign_keys = ON;")
  }

  async closeConnection(): Promise<void> {
    return this.#config.database.close()
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

    // const readonly =
    //   query.kind === "SelectQueryNode" || query.kind === "RawNode"

    // Check if the query has a RETURNING clause
    // const hasReturning = sql.toUpperCase().includes("RETURNING")

    // const transformedParameters = serialize([...parameters])

    // logger.trace(`${query.kind}${readonly ? " (readonly)" : ""}: ${sql}`)

    // if (readonly || hasReturning) {
    //   const { rows, rowsAffected, insertId } =
    //     await this.#config.database.execute(sql, transformedParameters)

    //   const skip =
    //     query.kind === "SelectQueryNode" &&
    //     (sql.includes("preferences") ||
    //       sql.includes("bookPreferences") ||
    //       sql.includes("pragma_table_info")) // @todo: fix this hack - find a better way

    //   if (!skip) {
    //     return {
    //       rows: autoAffinityDeserialize(rows, this.#config.onError) as R[],
    //       numAffectedRows: BigInt(rowsAffected),
    //       insertId: BigInt(insertId ?? 0),
    //     } satisfies QueryResult<R>
    //   }

    //   return {
    //     rows: rows as R[],
    //       numAffectedRows: BigInt(rowsAffected),
    //       insertId: BigInt(insertId ?? 0),
    //   } satisfies QueryResult<R>
    // } else {
    //   const res = await this.sqlite.runAsync(sql, transformedParameters)

    //   const queryResult = {
    //     numAffectedRows: BigInt(res.changes),
    //     insertId: BigInt(res.lastInsertRowId),
    //     rows: [],
    //   } satisfies QueryResult<R>

    //   logger.trace("queryResult", queryResult)

    //   return queryResult
    // }

    const { rows, rowsAffected, insertId } =
      await this.#config.database.execute(sql, parameters as Scalar[])
    return {
      rows: rows as R[],
      numAffectedRows: BigInt(rowsAffected),
      insertId: BigInt(insertId ?? 0),
    } satisfies QueryResult<R>
  }

  async directQuery<T>(query: string): Promise<Array<T>> {
    const { rows } = await this.#config.database.execute(query, [])
    return rows as T[]
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
