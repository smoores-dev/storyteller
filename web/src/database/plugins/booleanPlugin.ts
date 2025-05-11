import {
  AnyColumn,
  KyselyPlugin,
  OperationNodeTransformer,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  PrimitiveValueListNode,
  QueryResult,
  RootOperationNode,
  UnknownRow,
  ValueNode,
} from "kysely"

class SqliteBooleanTransformer extends OperationNodeTransformer {
  override transformPrimitiveValueList(
    node: PrimitiveValueListNode,
  ): PrimitiveValueListNode {
    return {
      ...super.transformPrimitiveValueList(node),
      values: node.values.map((value) =>
        typeof value === "boolean" ? (value ? 1 : 0) : value,
      ),
    }
  }

  override transformValue(node: ValueNode): ValueNode {
    return {
      ...super.transformValue(node),
      value:
        typeof node.value === "boolean" ? (node.value ? 1 : 0) : node.value,
    }
  }
}

export interface BooleanPluginOptions<DB> {
  fields: AnyColumn<DB, keyof DB>[]
}

export class BooleanPlugin<DB> implements KyselyPlugin {
  private transformer = new SqliteBooleanTransformer()
  private fields: AnyColumn<DB, keyof DB>[]

  public constructor({ fields }: BooleanPluginOptions<DB>) {
    this.fields = fields
  }

  public transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return this.transformer.transformNode(args.node)
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
