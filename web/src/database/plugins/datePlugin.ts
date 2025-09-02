import { isDate } from "@auth/core/adapters"
import {
  type KyselyPlugin,
  OperationNodeTransformer,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type PrimitiveValueListNode,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
  type ValueNode,
} from "kysely"

class SqliteDateTransformer extends OperationNodeTransformer {
  override transformPrimitiveValueList(
    node: PrimitiveValueListNode,
  ): PrimitiveValueListNode {
    return {
      ...super.transformPrimitiveValueList(node),
      values: node.values.map((value) =>
        value instanceof Date ? value.toISOString() : value,
      ),
    }
  }

  override transformValue(node: ValueNode): ValueNode {
    return {
      ...super.transformValue(node),
      value: node.value instanceof Date ? node.value.toISOString() : node.value,
    }
  }
}

export class DatePlugin implements KyselyPlugin {
  private transformer = new SqliteDateTransformer()

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
            isDate(columnValue)
              ? [columnName, new Date(columnValue)]
              : [columnName, columnValue],
          ),
        ),
      ),
    })
  }
}
