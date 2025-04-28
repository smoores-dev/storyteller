import {
  AnyColumn,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  RootOperationNode,
  UnknownRow,
} from "kysely"

export interface BooleanPluginOptions<DB> {
  fields: AnyColumn<DB, keyof DB>[]
}

export class BooleanPlugin<DB> implements KyselyPlugin {
  private fields: AnyColumn<DB, keyof DB>[]

  public constructor({ fields }: BooleanPluginOptions<DB>) {
    this.fields = fields
  }

  public transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return args.node
  }

  public transformResult(
    args: PluginTransformResultArgs,
  ): Promise<QueryResult<UnknownRow>> {
    return Promise.resolve({
      ...args.result,
      rows: args.result.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([columnName, columnValue]) =>
            this.fields.includes(columnName as AnyColumn<DB, keyof DB>)
              ? [columnName, !!columnValue]
              : [columnName, columnValue],
          ),
        ),
      ),
    })
  }
}

export function asInt(value: boolean | undefined) {
  if (value === undefined) return value
  return (value ? 1 : 0) as unknown as boolean
}
