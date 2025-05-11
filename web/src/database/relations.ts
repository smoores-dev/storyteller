import {
  Insertable,
  InsertObject,
  AnyColumnWithTable,
  AnyColumn,
  Generated,
} from "kysely"
import { DB } from "./schema"
import { UUID } from "@/uuid"
import { getDatabase } from "./connection"

type ExtractColumnType<DB, TB extends keyof DB, C> = {
  [T in TB]: C extends keyof DB[T] ? DB[T][C] : never
}[TB]

type ExtractTypeFromStringSelectExpression<
  DB,
  TB extends keyof DB,
  SE extends string,
> = SE extends `${infer SC}.${infer T}.${infer C} as ${string}`
  ? `${SC}.${T}` extends TB
    ? C extends keyof DB[`${SC}.${T}`]
      ? DB[`${SC}.${T}`][C]
      : never
    : never
  : SE extends `${infer T}.${infer C} as ${string}`
    ? T extends TB
      ? C extends keyof DB[T]
        ? DB[T][C]
        : never
      : never
    : SE extends `${infer C} as ${string}`
      ? C extends AnyColumn<DB, TB>
        ? ExtractColumnType<DB, TB, C>
        : never
      : SE extends `${infer SC}.${infer T}.${infer C}`
        ? `${SC}.${T}` extends TB
          ? C extends keyof DB[`${SC}.${T}`]
            ? DB[`${SC}.${T}`][C]
            : never
          : never
        : SE extends `${infer T}.${infer C}`
          ? T extends TB
            ? C extends keyof DB[T]
              ? DB[T][C]
              : never
            : never
          : SE extends AnyColumn<DB, TB>
            ? ExtractColumnType<DB, TB, SE>
            : never

type ExtractTypeFromGenerated<T> = T extends Generated<infer G> ? G : T

type ColumnType<
  DB,
  TB extends keyof DB,
  SE extends string,
> = ExtractTypeFromGenerated<ExtractTypeFromStringSelectExpression<DB, TB, SE>>

// This is... not my best work at abstraction. But despite the nightmare within
// the body of the function, the types all work out for callers

export async function syncRelations<
  RelatedTable extends keyof DB,
  RelationTable extends keyof DB,
  PK extends AnyColumn<DB, RelatedTable>,
  IdentifierColumn extends AnyColumn<DB, RelatedTable>,
  RelatedFKColumn extends AnyColumnWithTable<DB, RelationTable>,
  EntityFKColumn extends AnyColumnWithTable<DB, RelationTable>,
>({
  entityUuid,
  relations,
  relatedTable,
  relationTable,
  relatedPrimaryKeyColumn,
  identifierColumn,
  relatedForeignKeyColumn,
  entityForeignKeyColumn,
  extractRelatedValues,
  extractRelationValues,
  extractRelationUpdateValues,
}: {
  entityUuid: UUID
  relations: Array<Insertable<DB[RelatedTable] & DB[RelationTable]>>
  relatedTable: RelatedTable
  relationTable: RelationTable
  relatedPrimaryKeyColumn: PK
  identifierColumn: IdentifierColumn
  relatedForeignKeyColumn: RelatedFKColumn
  entityForeignKeyColumn: EntityFKColumn
  extractRelatedValues: (
    values: Omit<Insertable<DB[RelatedTable] & DB[RelationTable]>, PK>,
  ) => InsertObject<DB, RelatedTable>
  extractRelationValues: (
    relatedPrimaryKey: ColumnType<DB, RelatedTable, PK>,
    values: Omit<Insertable<DB[RelatedTable] & DB[RelationTable]>, PK>,
  ) => InsertObject<DB, RelationTable>
  extractRelationUpdateValues: (
    values: Omit<Insertable<DB[RelatedTable] & DB[RelationTable]>, PK>,
  ) => InsertObject<DB, RelationTable>
}) {
  const db = getDatabase()
  const relatedPrimaryKeys: unknown[] = []
  for (const relationValues of relations) {
    const { [relatedPrimaryKeyColumn]: relatedPrimaryKey, ...values } =
      relationValues

    if (!relatedPrimaryKey) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      let existing = (await db
        .selectFrom(relatedTable)
        // @ts-expect-error too much ts
        .select([relatedPrimaryKeyColumn])
        // @ts-expect-error too much ts
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        .where(identifierColumn, "=", values[identifierColumn])
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        .executeTakeFirst()) as
        | Record<PK, ColumnType<DB, RelatedTable, PK>>
        | undefined

      if (!existing) {
        existing = (await db
          .insertInto(relatedTable)
          .values(extractRelatedValues(values))
          .returning([
            `${relatedPrimaryKeyColumn} as ${relatedPrimaryKeyColumn}`,
          ])
          .executeTakeFirstOrThrow()) as unknown as Record<
          PK,
          ColumnType<DB, RelatedTable, PK>
        >
      }

      await db
        .insertInto(relationTable)
        .values(
          extractRelationValues(existing[relatedPrimaryKeyColumn], values),
        )
        .execute()

      relatedPrimaryKeys.push(existing[relatedPrimaryKeyColumn])

      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await db
      .updateTable(relatedTable)
      // @ts-expect-error too much ts
      .set(extractRelatedValues(values))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .where("uuid", "=", relatedPrimaryKey)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .execute()

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await db
      .updateTable(relationTable)
      // @ts-expect-error too much ts
      .set(extractRelationUpdateValues(values))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .where(relatedForeignKeyColumn, "=", relatedPrimaryKey)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .where(entityForeignKeyColumn, "=", entityUuid)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .execute()

    relatedPrimaryKeys.push(relatedPrimaryKey)
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  await db
    .deleteFrom(relationTable)
    // @ts-expect-error too much ts
    .where(entityForeignKeyColumn, "=", entityUuid)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    .where(relatedForeignKeyColumn, "not in", relatedPrimaryKeys)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    .execute()

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  await db
    .deleteFrom(relatedTable)
    // @ts-expect-error too much ts
    .whereRef(relatedPrimaryKeyColumn, "not in", (eb) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      eb.selectFrom(relationTable).select([relatedForeignKeyColumn]),
    )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    .execute()
}
