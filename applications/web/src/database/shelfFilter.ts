import {
  type ExpressionBuilder,
  type RawBuilder,
  type ReferenceExpression,
  sql,
} from "kysely"

import { type DB } from "@/database/schema.ts"
import {
  ALIGNMENT_GRADES,
  FIELD_REGISTRY,
  type Field,
  type FilterEntityType,
  RETIRED_FIELDS,
  getFieldDef,
  isRetiredField,
  resolveFieldAlias,
} from "@/fields"
import {
  type ShelfFilter,
  type ShelfFilterCondition,
  ShelfFilterInvalidError,
  type ShelfFilterNode,
  type ShelfFilterValue,
  isFieldRefValue,
} from "@/shelves"
import { type SortField } from "@/sort"
import { type UUID } from "@/uuid"

import { db } from "./connection"
import {
  type EB,
  FIELD_SQL,
  type FieldSqlCtx,
  type FilterExpression,
  assetNumericExpr,
  buildBookSearchExpression,
  buildBookSearchRelevance,
  formatPredicate,
  mainSeriesNameExpr,
  numericExprComparison,
  seriesPositionExpr,
  statusLabelExpr,
  statusRankExpr,
} from "./fieldSql"

export {
  type EB,
  type FilterExpression,
  buildBookSearchExpression,
  buildBookSearchRelevance,
  formatPredicate,
}

export function normalizeCondition(
  condition: ShelfFilterCondition,
): ShelfFilterCondition | null {
  const legacy = condition as ShelfFilterCondition & {
    role?: string
    dimension?: string
  }

  let field = condition.field as string
  let operator = condition.operator
  let value = condition.value
  let qualifier = condition.qualifier ?? legacy.role ?? legacy.dimension

  switch (field) {
    case "rating":
    case "ratingDimension": {
      field = "userRating"
      break
    }
    case "identifierName":
    case "identifierValue": {
      field = "identifiers"
      if (operator !== "isEmpty") {
        operator = "isNotEmpty"
      }
      value = undefined
      break
    }
  }

  if (!(field in FIELD_REGISTRY)) {
    return null
  }

  const resolved = resolveFieldAlias(field as Field)
  qualifier = resolved.qualifier ?? qualifier

  return {
    type: "condition",
    field: resolved.field,
    operator,
    value,
    ...(qualifier !== undefined ? { qualifier } : {}),
    ...(condition.format !== undefined ? { format: condition.format } : {}),
    ...(condition.aggregate !== undefined
      ? { aggregate: condition.aggregate }
      : {}),
  }
}

export function extractEntityReferences(filter: ShelfFilter): Array<{
  entityType: FilterEntityType
  entityUuid: UUID
}> {
  const refs: Array<{ entityType: FilterEntityType; entityUuid: UUID }> = []

  function walk(node: ShelfFilterNode) {
    if (node.type === "condition") {
      const normalized = normalizeCondition(node)
      if (!normalized) return

      const def = getFieldDef(normalized.field)

      if (def.qualifierEntity && normalized.qualifier) {
        refs.push({
          entityType: def.qualifierEntity,
          entityUuid: normalized.qualifier as UUID,
        })
      }

      if (!def.entity) {
        return
      }
      if (normalized.value === undefined || normalized.value === null) {
        return
      }

      const values = Array.isArray(normalized.value)
        ? normalized.value
        : [normalized.value]
      for (const v of values) {
        if (typeof v === "string") {
          refs.push({ entityType: def.entity, entityUuid: v as UUID })
        }
      }

      return
    }

    if (node.type === "not") {
      walk(node.child)
      return
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(filter)
  return refs
}

export function removeDeletedEntityReferences(
  filter: ShelfFilter,
  entityType: FilterEntityType,
  entityUuid: string,
): ShelfFilter | null {
  function walk(node: ShelfFilterNode): ShelfFilterNode | null {
    if (node.type === "condition") {
      if (!(node.field in FIELD_REGISTRY)) return node
      const def = getFieldDef(node.field)

      if (def.qualifierEntity === entityType) {
        const normalized = normalizeCondition(node)
        if (normalized?.qualifier === entityUuid) return null
      }

      if (def.entity !== entityType) return node

      if (node.value === undefined || node.value === null) return node

      if (Array.isArray(node.value)) {
        const filtered = (node.value as (string | number)[]).filter(
          (v) => v !== entityUuid,
        )
        if (filtered.length === 0) return null
        return { ...node, value: filtered }
      }

      if (node.value === entityUuid) return null
      return node
    }

    if (node.type === "not") {
      const newChild = walk(node.child)
      if (!newChild) return null
      return { ...node, child: newChild }
    }

    const newChildren = node.children
      .map(walk)
      .filter((c): c is ShelfFilterNode => c !== null)

    if (newChildren.length === 0) return null
    return { ...node, children: newChildren }
  }

  return walk(filter)
}

export async function cleanShelfFiltersForDeletedEntity(
  entityType: FilterEntityType,
  entityUuid: UUID,
) {
  const refs = await db
    .selectFrom("shelfFilterReference")
    .innerJoin("shelf", "shelf.uuid", "shelfFilterReference.shelfUuid")
    .select(["shelf.uuid", "shelf.filter", "shelf.userId"])
    .where("shelfFilterReference.entityType", "=", entityType)
    .where("shelfFilterReference.entityUuid", "=", entityUuid)
    .execute()

  for (const shelf of refs) {
    const filter = shelf.filter
      ? typeof shelf.filter === "string"
        ? (JSON.parse(shelf.filter) as ShelfFilter)
        : shelf.filter
      : null

    if (!filter) continue

    const cleaned = removeDeletedEntityReferences(
      filter,
      entityType,
      entityUuid,
    )

    await db
      .updateTable("shelf")
      .set({ filter: cleaned ? JSON.stringify(cleaned) : null })
      .where("uuid", "=", shelf.uuid)
      .execute()

    await db
      .deleteFrom("shelfFilterReference")
      .where("shelfUuid", "=", shelf.uuid)
      .execute()

    if (cleaned) {
      const newRefs = extractEntityReferences(cleaned)

      if (newRefs.length > 0) {
        await db
          .insertInto("shelfFilterReference")
          .values(
            newRefs.map((ref) => ({
              shelfUuid: shelf.uuid,
              entityType: ref.entityType,
              entityUuid: ref.entityUuid,
            })),
          )
          .execute()
      }
    }
  }
}

export function bookVisibleTo(
  eb: ExpressionBuilder<DB, keyof DB>,
  bookUuidRef: ReferenceExpression<
    DB,
    "book" | "bookToCreator" | "bookToSeries" | "bookToTag" | "bookToStatus"
  >,
  userId: UUID,
): FilterExpression {
  return eb.exists(
    eb
      .selectFrom("bookAccess")
      .select(sql.lit(1).as("one"))
      .whereRef("bookAccess.bookUuid", "=", bookUuidRef)
      .where("bookAccess.userId", "=", userId),
  )
}

export function buildFilterExpression(
  eb: EB,
  node: ShelfFilterNode,
  userId?: UUID,
): FilterExpression {
  switch (node.type) {
    case "and":
      if (node.children.length === 0) return eb.lit(true)
      return eb.and(
        node.children.map((child) => buildFilterExpression(eb, child, userId)),
      )

    case "or":
      if (node.children.length === 0) return eb.lit(false)
      return eb.or(
        node.children.map((child) => buildFilterExpression(eb, child, userId)),
      )

    case "not":
      return eb.not(buildFilterExpression(eb, node.child, userId))

    case "condition":
      return buildConditionExpression(eb, node, userId)
  }
}

function buildConditionExpression(
  eb: EB,
  condition: ShelfFilterCondition,
  userId?: UUID,
): FilterExpression {
  const normalized = normalizeCondition(condition)
  if (!normalized) throw unknownFieldError(condition.field)

  const impl = FIELD_SQL[normalized.field as keyof typeof FIELD_SQL]
  const ctx: FieldSqlCtx = {
    userId,
    qualifier: normalized.qualifier,
    format: normalized.format,
  }

  if (normalized.aggregate === "count") {
    if (!("count" in impl) || !impl.count) return eb.lit(true)
    if (normalized.value === undefined || normalized.value === null)
      return eb.lit(true)
    return numericExprComparison(
      eb,
      impl.count(eb, ctx),
      normalized.operator,
      normalized.value,
    )
  }

  if (normalized.operator === "isEmpty") {
    return impl.isEmpty(eb, ctx)
  }

  if (normalized.operator === "isNotEmpty") {
    return eb.not(impl.isEmpty(eb, ctx))
  }

  if (normalized.value === undefined || normalized.value === null) {
    return eb.lit(true)
  }

  if (
    normalized.operator !== "intersects" &&
    valueContainsRef(normalized.value)
  ) {
    return buildRefComparison(eb, normalized, impl, ctx)
  }

  return impl.compare(eb, normalized.operator, normalized.value, ctx)
}

function valueContainsRef(value: ShelfFilterValue): boolean {
  if (isFieldRefValue(value)) return true
  return Array.isArray(value) && value.some((v) => isFieldRefValue(v))
}

function refOperand(
  eb: EB,
  baseField: string,
  operand: unknown,
  userId?: UUID,
): RawBuilder<number> | null {
  if (typeof operand === "number") {
    return sql<number>`${operand}`
  }
  if (!isFieldRefValue(operand)) {
    return null
  }

  const targetName = operand.ref.field ?? baseField
  if (!(targetName in FIELD_REGISTRY)) throw unknownFieldError(targetName)

  const resolved = resolveFieldAlias(targetName as Field)
  const impl = FIELD_SQL[resolved.field as keyof typeof FIELD_SQL]
  const expr = impl.scalar?.(eb, {
    userId,
    qualifier: resolved.qualifier ?? operand.ref.qualifier,
    format: operand.ref.format,
  })
  if (!expr) return null

  return operand.factor != null
    ? sql<number>`(${expr} * ${operand.factor})`
    : expr
}

function buildRefComparison(
  eb: EB,
  condition: ShelfFilterCondition,
  impl: (typeof FIELD_SQL)[keyof typeof FIELD_SQL],
  ctx: FieldSqlCtx,
): FilterExpression {
  const lhs = impl.scalar?.(eb, ctx)
  if (!lhs) return eb.lit(true)

  if (condition.operator === "between") {
    if (!Array.isArray(condition.value) || condition.value.length !== 2)
      return eb.lit(true)
    const lo = refOperand(eb, condition.field, condition.value[0], ctx.userId)
    const hi = refOperand(eb, condition.field, condition.value[1], ctx.userId)
    if (!lo || !hi) return eb.lit(true)
    return eb.and([eb(lhs, ">=", lo), eb(lhs, "<=", hi)])
  }

  const rhs = refOperand(eb, condition.field, condition.value, ctx.userId)
  if (!rhs) return eb.lit(true)

  switch (condition.operator) {
    case "is":
      return eb(lhs, "=", rhs)
    case "isNot":
      return eb(lhs, "!=", rhs)
    case "greaterThan":
      return eb(lhs, ">", rhs)
    case "lessThan":
      return eb(lhs, "<", rhs)
    case "greaterOrEqual":
      return eb(lhs, ">=", rhs)
    case "lessOrEqual":
      return eb(lhs, "<=", rhs)
    default:
      return eb.lit(true)
  }
}

function latestReportColumn(column: string) {
  return sql`(select ${sql.raw(column)} from alignment_report where book_uuid = book.uuid order by created_at desc limit 1)`
}

export function buildSortExpression(
  field: SortField,
  ctx?: { userId?: UUID; seriesContext?: UUID | null },
) {
  switch (field) {
    case "title":
      return sql`book.title collate nocase`
    case "createdAt":
      return sql`book.created_at`
    case "updatedAt":
      return sql`book.updated_at`
    case "publicationDate":
      return sql`book.publication_date`
    case "releaseDate":
      return sql`book.release_date`
    case "alignedAt":
      return sql`book.aligned_at`
    case "lastRead":
      return ctx?.userId
        ? sql`(select updated_at from position where book_uuid = book.uuid and user_id = ${ctx.userId} limit 1)`
        : sql`(select updated_at from position where book_uuid = book.uuid limit 1)`
    case "language":
      return sql`book.language collate nocase`
    case "alignmentConfidence":
      return latestReportColumn("confidence")
    case "alignmentSentenceCoverage":
      return latestReportColumn("sentence_coverage")
    case "alignmentAudioCoverage":
      return latestReportColumn("audio_coverage")
    case "alignmentGrade":
      return sql`case ${latestReportColumn("grade")} ${sql.join(
        ALIGNMENT_GRADES.map(
          (grade, i) => sql`when ${grade} then ${ALIGNMENT_GRADES.length - i}`,
        ),
        sql` `,
      )} else null end`
    case "pageCount":
    case "duration":
    case "fileSize":
      return assetNumericExpr(field)
    case "authors":
      return sql`(select creator.name from book_to_creator inner join creator on book_to_creator.creator_uuid = creator.uuid where book_to_creator.book_uuid = book.uuid and book_to_creator.role = 'aut' limit 1) collate nocase`
    case "userRating":
      return ctx?.userId
        ? sql`(select rating from user_book_rating where book_uuid = book.uuid and user_id = ${ctx.userId} limit 1)`
        : sql`(select rating from user_book_rating where book_uuid = book.uuid limit 1)`
    case "seriesPosition":
      return seriesPositionExpr(ctx?.seriesContext ?? undefined)
    case "status":
      return statusRankExpr(ctx?.userId)
    default: {
      const _exhaustive: never = field
      return sql.lit(true)
    }
  }
}

export function buildSortExpressions(
  field: SortField,
  ctx?: { userId?: UUID; seriesContext?: UUID | null },
) {
  if (field === "seriesPosition" && !ctx?.seriesContext) {
    return [
      sql`${mainSeriesNameExpr()} collate nocase`,
      seriesPositionExpr(undefined),
    ]
  }

  if (field === "status") {
    return [statusRankExpr(ctx?.userId), statusLabelExpr(ctx?.userId)]
  }

  return [buildSortExpression(field, ctx)]
}

function unknownFieldError(field: string) {
  return new ShelfFilterInvalidError([
    isRetiredField(field)
      ? {
          kind: "retiredField",
          field,
          replacedBy: RETIRED_FIELDS[field].replacedBy,
        }
      : { kind: "unknownField", field },
  ])
}
