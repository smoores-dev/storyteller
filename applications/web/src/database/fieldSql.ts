import {
  type Expression,
  type ExpressionBuilder,
  type ExpressionWrapper,
  type RawBuilder,
  type SqlBool,
  sql,
} from "kysely"

import { type Role } from "@/components/books/edit/marcRelators"
import {
  type AssetFormat,
  type BaseField,
  FORMAT_VALUES,
  type FormatValue,
} from "@/fields"
import {
  type ShelfFilterOperator,
  type ShelfFilterValue,
  isFieldRefValue,
  shelfValueText,
} from "@/shelves"
import { type UUID } from "@/uuid"

import { type DB } from "./schema"

export type EB = ExpressionBuilder<DB, "book">
export type FilterExpression = ExpressionWrapper<DB, "book", SqlBool>

export type FieldSqlCtx = {
  userId?: UUID
  qualifier?: string
  format?: AssetFormat
}

export type FieldSqlImpl = {
  isEmpty: (eb: EB, ctx: FieldSqlCtx) => FilterExpression
  compare: (
    eb: EB,
    operator: ShelfFilterOperator,
    value: ShelfFilterValue,
    ctx: FieldSqlCtx,
  ) => FilterExpression
  count?: (eb: EB, ctx: FieldSqlCtx) => RawBuilder<number>
  scalar?: (eb: EB, ctx: FieldSqlCtx) => RawBuilder<number>
}

function stringExprComparison(
  eb: EB,
  expr: RawBuilder<unknown>,
  operator: ShelfFilterOperator,
  value: ShelfFilterValue,
): FilterExpression {
  const strValue = shelfValueText(value)

  switch (operator) {
    case "is":
      return eb(sql`lower(${expr})`, "=", strValue.toLowerCase())

    case "isNot":
      return eb(sql`lower(${expr})`, "!=", strValue.toLowerCase())

    case "contains":
      return eb(sql`lower(${expr})`, "like", `%${strValue.toLowerCase()}%`)

    case "notContains":
      return eb.or([
        eb(expr, "is", null),
        eb.not(eb(sql`lower(${expr})`, "like", `%${strValue.toLowerCase()}%`)),
      ])

    case "startsWith":
      return eb(sql`lower(${expr})`, "like", `${strValue.toLowerCase()}%`)

    case "endsWith":
      return eb(sql`lower(${expr})`, "like", `%${strValue.toLowerCase()}`)

    case "isAnyOf":
      if (!Array.isArray(value)) return eb.lit(true)
      return eb(
        sql`lower(${expr})`,
        "in",
        value.map((v) => shelfValueText(v).toLowerCase()),
      )

    case "isNoneOf":
      if (!Array.isArray(value)) return eb.lit(true)
      return eb.or([
        eb(expr, "is", null),
        eb.not(
          eb(
            sql`lower(${expr})`,
            "in",
            value.map((v) => shelfValueText(v).toLowerCase()),
          ),
        ),
      ])

    default:
      return eb.lit(true)
  }
}

export function numericExprComparison(
  eb: EB,
  expr: RawBuilder<number>,
  operator: ShelfFilterOperator,
  value: ShelfFilterValue,
): FilterExpression {
  switch (operator) {
    case "is":
      return eb(expr, "=", Number(value))

    case "isNot":
      return eb(expr, "!=", Number(value))

    case "greaterThan":
      return eb(expr, ">", Number(value))

    case "lessThan":
      return eb(expr, "<", Number(value))

    case "greaterOrEqual":
      return eb(expr, ">=", Number(value))

    case "lessOrEqual":
      return eb(expr, "<=", Number(value))

    case "between":
      if (!Array.isArray(value) || value.length !== 2) return eb.lit(true)
      return eb.and([
        eb(expr, ">=", Number(value[0])),
        eb(expr, "<=", Number(value[1])),
      ])

    default:
      return eb.lit(true)
  }
}

type StringBookColumn =
  | "book.title"
  | "book.subtitle"
  | "book.description"
  | "book.language"
  | "book.alignedWith"
  | "book.alignedByStorytellerVersion"

function stringColumn(column: StringBookColumn): FieldSqlImpl {
  return {
    isEmpty: (eb) => eb.or([eb(column, "is", null), eb(column, "=", "")]),
    compare: (eb, operator, value) =>
      stringExprComparison(eb, sql`${sql.ref(column)}`, operator, value),
  }
}

type DateBookColumn =
  | "book.publicationDate"
  | "book.createdAt"
  | "book.updatedAt"
  | "book.alignedAt"

function dateColumn(column: DateBookColumn): FieldSqlImpl {
  return {
    isEmpty: (eb) => eb.or([eb(column, "is", null), eb(column, "=", "")]),
    compare: (eb, operator, value) => {
      switch (operator) {
        case "is":
          return eb(column, "=", shelfValueText(value))

        case "isNot":
          return eb(column, "!=", shelfValueText(value))

        case "before":
          return eb(column, "<", shelfValueText(value))

        case "after":
          return eb(column, ">", shelfValueText(value))

        case "between":
          if (!Array.isArray(value) || value.length !== 2) return eb.lit(true)
          return eb.and([
            eb(column, ">=", shelfValueText(value[0])),
            eb(column, "<=", shelfValueText(value[1])),
          ])

        default:
          return eb.lit(true)
      }
    },
  }
}

function latestReportColumn(column: string, offset = 0) {
  return sql`(select ${sql.raw(column)} from alignment_report where book_uuid = book.uuid order by created_at desc, rowid desc limit 1 offset ${sql.lit(offset)})`
}

function reportNumber(column: string): FieldSqlImpl {
  return {
    isEmpty: (eb) => eb(latestReportColumn(column), "is", null),
    compare: (eb, operator, value) =>
      numericExprComparison(
        eb,
        latestReportColumn(column) as RawBuilder<number>,
        operator,
        value,
      ),
    scalar: () => latestReportColumn(column) as RawBuilder<number>,
  }
}

function reportString(column: string, offset = 0): FieldSqlImpl {
  return {
    isEmpty: (eb) => eb(latestReportColumn(column, offset), "is", null),
    compare: (eb, operator, value) =>
      stringExprComparison(
        eb,
        latestReportColumn(column, offset),
        operator,
        value,
      ),
  }
}

type AssetNumericField = "fileSize" | "duration" | "pageCount"

export function assetNumericExpr(field: AssetNumericField): RawBuilder<number> {
  switch (field) {
    case "pageCount":
      return sql<number>`coalesce(
        (select e.page_count from ebook e where e.book_uuid = book.uuid),
        (select r.page_count from readaloud r where r.book_uuid = book.uuid),
        book.page_count
      )`

    case "duration":
      return sql<number>`coalesce(
        (select a.duration from audiobook a where a.book_uuid = book.uuid),
        (select r.duration from readaloud r where r.book_uuid = book.uuid),
        book.duration
      )`

    case "fileSize":
      return sql<number>`coalesce(
        (select max(s.file_size) from (
          select e.file_size from ebook e where e.book_uuid = book.uuid
          union all
          select a.file_size from audiobook a where a.book_uuid = book.uuid
          union all
          select r.file_size from readaloud r where r.book_uuid = book.uuid
        ) s),
        0
      )`
  }
}

function formatScopedNumericExpr(
  field: AssetNumericField,
  format: AssetFormat,
): RawBuilder<number> {
  switch (format) {
    case "ebook":
      if (field === "pageCount")
        return sql<number>`(select e.page_count from ebook e where e.book_uuid = book.uuid limit 1)`
      if (field === "fileSize")
        return sql<number>`(select e.file_size from ebook e where e.book_uuid = book.uuid limit 1)`
      return sql<number>`null`
    case "audiobook":
      if (field === "duration")
        return sql<number>`(select a.duration from audiobook a where a.book_uuid = book.uuid limit 1)`
      if (field === "fileSize")
        return sql<number>`(select a.file_size from audiobook a where a.book_uuid = book.uuid limit 1)`
      return sql<number>`null`
    case "readaloud":
      if (field === "pageCount")
        return sql<number>`(select r.page_count from readaloud r where r.book_uuid = book.uuid limit 1)`
      if (field === "duration")
        return sql<number>`(select r.duration from readaloud r where r.book_uuid = book.uuid limit 1)`
      return sql<number>`(select r.file_size from readaloud r where r.book_uuid = book.uuid limit 1)`
  }
}

function noEbookWith(eb: EB, column: "ebook.pageCount" | "ebook.fileSize") {
  return eb.not(
    eb.exists(
      eb
        .selectFrom("ebook")
        .select(sql.lit(1).as("one"))
        .whereRef("ebook.bookUuid", "=", "book.uuid")
        .where(column, "is not", null),
    ),
  )
}

function noAudiobookWith(
  eb: EB,
  column: "audiobook.duration" | "audiobook.fileSize",
) {
  return eb.not(
    eb.exists(
      eb
        .selectFrom("audiobook")
        .select(sql.lit(1).as("one"))
        .whereRef("audiobook.bookUuid", "=", "book.uuid")
        .where(column, "is not", null),
    ),
  )
}

function noReadaloudWith(
  eb: EB,
  column: "readaloud.pageCount" | "readaloud.duration" | "readaloud.fileSize",
) {
  return eb.not(
    eb.exists(
      eb
        .selectFrom("readaloud")
        .select(sql.lit(1).as("one"))
        .whereRef("readaloud.bookUuid", "=", "book.uuid")
        .where(column, "is not", null),
    ),
  )
}

function assetNumeric(field: AssetNumericField): FieldSqlImpl {
  return {
    isEmpty: (eb) => {
      switch (field) {
        case "pageCount":
          return eb.and([
            noEbookWith(eb, "ebook.pageCount"),
            noReadaloudWith(eb, "readaloud.pageCount"),
            eb("book.pageCount", "is", null),
          ])
        case "duration":
          return eb.and([
            noAudiobookWith(eb, "audiobook.duration"),
            noReadaloudWith(eb, "readaloud.duration"),
            eb("book.duration", "is", null),
          ])
        case "fileSize":
          return eb.and([
            noEbookWith(eb, "ebook.fileSize"),
            noAudiobookWith(eb, "audiobook.fileSize"),
            noReadaloudWith(eb, "readaloud.fileSize"),
          ])
      }
    },
    compare: (eb, operator, value, ctx) => {
      const expr = ctx.format
        ? formatScopedNumericExpr(field, ctx.format)
        : assetNumericExpr(field)
      return numericExprComparison(eb, expr, operator, value)
    },
    scalar: (_eb, ctx) =>
      ctx.format
        ? formatScopedNumericExpr(field, ctx.format)
        : assetNumericExpr(field),
  }
}

function ratingBase(eb: EB, ctx: FieldSqlCtx) {
  return eb
    .selectFrom("userBookRating")
    .select(sql.lit(1).as("one"))
    .whereRef("userBookRating.bookUuid", "=", "book.uuid")
    .$if(!!ctx.userId, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where("userBookRating.userId", "=", ctx.userId!),
    )
}

function ratingScoreExpr(qualifier: string) {
  const path = `$.${qualifier}`
  return sql<number>`json_extract(${sql.ref("userBookRating.dimensions")}, ${path})`
}

const userRating: FieldSqlImpl = {
  isEmpty: (eb, ctx) => {
    const score = ctx.qualifier
      ? ratingScoreExpr(ctx.qualifier)
      : sql<number>`${sql.ref("userBookRating.rating")}`
    return eb.not(eb.exists(ratingBase(eb, ctx).where(score, "is not", null)))
  },
  compare: (eb, operator, value, ctx) => {
    const score = ctx.qualifier
      ? ratingScoreExpr(ctx.qualifier)
      : sql<number>`${sql.ref("userBookRating.rating")}`
    const base = ratingBase(eb, ctx)

    switch (operator) {
      case "is":
        return eb.exists(base.where(score, "=", Number(value)))
      case "isNot":
        return eb.or([
          eb.not(eb.exists(base)),
          eb.exists(base.where(score, "!=", Number(value))),
        ])
      case "greaterThan":
        return eb.exists(base.where(score, ">", Number(value)))
      case "lessThan":
        return eb.exists(base.where(score, "<", Number(value)))
      case "greaterOrEqual":
        return eb.exists(base.where(score, ">=", Number(value)))
      case "lessOrEqual":
        return eb.exists(base.where(score, "<=", Number(value)))
      case "between":
        if (!Array.isArray(value) || value.length !== 2) return eb.lit(true)
        return eb.exists(
          base
            .where(score, ">=", Number(value[0]))
            .where(score, "<=", Number(value[1])),
        )
      default:
        return eb.lit(true)
    }
  },
  scalar: (_eb, ctx) => {
    const score = ctx.qualifier
      ? sql<number>`json_extract(user_book_rating.dimensions, ${`$.${ctx.qualifier}`})`
      : sql<number>`user_book_rating.rating`
    return ctx.userId
      ? sql<number>`(select ${score} from user_book_rating where book_uuid = book.uuid and user_id = ${ctx.userId} limit 1)`
      : sql<number>`(select ${score} from user_book_rating where book_uuid = book.uuid limit 1)`
  },
}

const review: FieldSqlImpl = {
  isEmpty: (eb, ctx) =>
    eb.not(
      eb.exists(
        ratingBase(eb, ctx).where("userBookRating.review", "is not", null),
      ),
    ),
  compare: (eb, operator, value, ctx) => {
    const base = ratingBase(eb, ctx)
    const lower = sql`lower(${sql.ref("userBookRating.review")})`
    const str = shelfValueText(value).toLowerCase()

    switch (operator) {
      case "is":
        return eb.exists(base.where(lower, "=", str))
      case "isNot":
        return eb.not(eb.exists(base.where(lower, "=", str)))
      case "contains":
        return eb.exists(base.where(lower, "like", `%${str}%`))
      case "notContains":
        return eb.not(eb.exists(base.where(lower, "like", `%${str}%`)))
      case "startsWith":
        return eb.exists(base.where(lower, "like", `${str}%`))
      case "endsWith":
        return eb.exists(base.where(lower, "like", `%${str}`))
      default:
        return eb.lit(true)
    }
  },
}

function positionBase(eb: EB, ctx: FieldSqlCtx) {
  return eb
    .selectFrom("position")
    .select(sql.lit(1).as("one"))
    .whereRef("position.bookUuid", "=", "book.uuid")
    .$if(!!ctx.userId, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where("position.userId", "=", ctx.userId!),
    )
}

const progressionExpr = sql<number>`json_extract(${sql.ref("position.locator")}, '$.locations.totalProgression')`

const lastRead: FieldSqlImpl = {
  isEmpty: (eb, ctx) => eb.not(eb.exists(positionBase(eb, ctx))),
  compare: (eb, operator, value, ctx) => {
    const base = positionBase(eb, ctx)
    const col = "position.updatedAt" as const

    switch (operator) {
      case "is":
        return eb.exists(base.where(col, "=", shelfValueText(value)))
      case "isNot":
        return eb.not(eb.exists(base.where(col, "=", shelfValueText(value))))
      case "before":
        return eb.exists(base.where(col, "<", shelfValueText(value)))
      case "after":
        return eb.exists(base.where(col, ">", shelfValueText(value)))
      case "between":
        if (!Array.isArray(value) || value.length !== 2) return eb.lit(true)
        return eb.exists(
          base
            .where(col, ">=", shelfValueText(value[0]))
            .where(col, "<=", shelfValueText(value[1])),
        )
      default:
        return eb.lit(true)
    }
  },
}

const readingPosition: FieldSqlImpl = {
  isEmpty: (eb, ctx) =>
    eb.not(
      eb.exists(positionBase(eb, ctx).where(progressionExpr, "is not", null)),
    ),
  compare: (eb, operator, value, ctx) => {
    const base = positionBase(eb, ctx)

    switch (operator) {
      case "is":
        return eb.exists(base.where(progressionExpr, "=", Number(value)))
      case "isNot":
        return eb.not(
          eb.exists(base.where(progressionExpr, "=", Number(value))),
        )
      case "greaterThan":
        return eb.exists(base.where(progressionExpr, ">", Number(value)))
      case "lessThan":
        return eb.exists(base.where(progressionExpr, "<", Number(value)))
      case "greaterOrEqual":
        return eb.exists(base.where(progressionExpr, ">=", Number(value)))
      case "lessOrEqual":
        return eb.exists(base.where(progressionExpr, "<=", Number(value)))
      case "between":
        if (!Array.isArray(value) || value.length !== 2) return eb.lit(true)
        return eb.exists(
          base
            .where(progressionExpr, ">=", Number(value[0]))
            .where(progressionExpr, "<=", Number(value[1])),
        )
      default:
        return eb.lit(true)
    }
  },
}

function tagBase(eb: EB) {
  return eb
    .selectFrom("bookToTag")
    .select(sql.lit(1).as("one"))
    .whereRef("bookToTag.bookUuid", "=", "book.uuid")
}

function collectionBase(eb: EB) {
  return eb
    .selectFrom("bookToCollection")
    .select(sql.lit(1).as("one"))
    .whereRef("bookToCollection.bookUuid", "=", "book.uuid")
}

function seriesBase(eb: EB) {
  return eb
    .selectFrom("bookToSeries")
    .select(sql.lit(1).as("one"))
    .whereRef("bookToSeries.bookUuid", "=", "book.uuid")
}

function creatorBase(eb: EB, ctx: FieldSqlCtx) {
  return eb
    .selectFrom("bookToCreator")
    .select(sql.lit(1).as("one"))
    .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
    .$if(!!ctx.qualifier, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where("bookToCreator.role", "=", ctx.qualifier! as Role),
    )
}

function relationImpl<QB extends Expression<unknown>>(cfg: {
  base: (eb: EB, ctx: FieldSqlCtx) => QB
  single: (qb: QB, uuid: UUID) => QB
  member: (qb: QB, uuids: UUID[]) => QB
  count: (eb: EB, ctx: FieldSqlCtx) => RawBuilder<number>
}): FieldSqlImpl {
  return {
    isEmpty: (eb, ctx) => eb.not(eb.exists(cfg.base(eb, ctx))),
    compare: (eb, operator, value, ctx) => {
      if (!Array.isArray(value)) return eb.lit(true)
      const uuids = value.map((v) => shelfValueText(v) as UUID)

      switch (operator) {
        case "includes":
          return eb.exists(cfg.member(cfg.base(eb, ctx), uuids))

        case "includesAll":
          return eb.and(
            uuids.map((uuid) => eb.exists(cfg.single(cfg.base(eb, ctx), uuid))),
          )

        case "excludes":
          return eb.not(eb.exists(cfg.member(cfg.base(eb, ctx), uuids)))

        default:
          return eb.lit(true)
      }
    },
    count: cfg.count,
  }
}

const tags = relationImpl({
  base: (eb) => tagBase(eb),
  single: (qb, uuid) => qb.where("bookToTag.tagUuid", "=", uuid),
  member: (qb, uuids) => qb.where("bookToTag.tagUuid", "in", uuids),
  count: () =>
    sql<number>`(select count(*) from book_to_tag where book_uuid = book.uuid)`,
})

const collections = relationImpl({
  base: (eb) => collectionBase(eb),
  single: (qb, uuid) => qb.where("bookToCollection.collectionUuid", "=", uuid),
  member: (qb, uuids) =>
    qb.where("bookToCollection.collectionUuid", "in", uuids),
  count: () =>
    sql<number>`(select count(*) from book_to_collection where book_uuid = book.uuid)`,
})

const series = relationImpl({
  base: (eb) => seriesBase(eb),
  single: (qb, uuid) => qb.where("bookToSeries.seriesUuid", "=", uuid),
  member: (qb, uuids) => qb.where("bookToSeries.seriesUuid", "in", uuids),
  count: () =>
    sql<number>`(select count(*) from book_to_series where book_uuid = book.uuid)`,
})

const creatorsRelation = relationImpl({
  base: creatorBase,
  single: (qb, uuid) => qb.where("bookToCreator.creatorUuid", "=", uuid),
  member: (qb, uuids) => qb.where("bookToCreator.creatorUuid", "in", uuids),
  count: (_eb, ctx) =>
    ctx.qualifier
      ? sql<number>`(select count(*) from book_to_creator where book_uuid = book.uuid and role = ${ctx.qualifier})`
      : sql<number>`(select count(*) from book_to_creator where book_uuid = book.uuid)`,
})

const creators: FieldSqlImpl = {
  ...creatorsRelation,
  compare: (eb, operator, value, ctx) => {
    if (operator === "intersects") {
      const other = isFieldRefValue(value) ? value.ref.qualifier : undefined
      if (!other) return eb.lit(true)
      return eb.exists(
        eb
          .selectFrom("bookToCreator as a")
          .innerJoin("bookToCreator as b", (join) =>
            join
              .onRef("b.bookUuid", "=", "a.bookUuid")
              .onRef("b.creatorUuid", "=", "a.creatorUuid"),
          )
          .select(sql.lit(1).as("one"))
          .whereRef("a.bookUuid", "=", "book.uuid")
          .$if(!!ctx.qualifier, (qb) =>
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            qb.where("a.role", "=", ctx.qualifier! as Role),
          )
          .where("b.role", "=", other as Role),
      )
    }
    return creatorsRelation.compare(eb, operator, value, ctx)
  },
}

function statusBase(eb: EB, ctx: FieldSqlCtx) {
  return eb
    .selectFrom("bookToStatus")
    .select(sql.lit(1).as("one"))
    .whereRef("bookToStatus.bookUuid", "=", "book.uuid")
    .$if(!!ctx.userId, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where("bookToStatus.userId", "=", ctx.userId!),
    )
}

const status: FieldSqlImpl = {
  isEmpty: (eb, ctx) => eb.not(eb.exists(statusBase(eb, ctx))),
  compare: (eb, operator, value, ctx) => {
    switch (operator) {
      case "is":
        return eb.exists(
          statusBase(eb, ctx).where(
            "bookToStatus.statusUuid",
            "=",
            shelfValueText(value) as UUID,
          ),
        )

      case "isNot":
        return eb.not(
          eb.exists(
            statusBase(eb, ctx).where(
              "bookToStatus.statusUuid",
              "=",
              shelfValueText(value) as UUID,
            ),
          ),
        )

      case "isAnyOf":
        if (!Array.isArray(value)) return eb.lit(true)
        return eb.exists(
          statusBase(eb, ctx).where(
            "bookToStatus.statusUuid",
            "in",
            value.map((v) => shelfValueText(v) as UUID),
          ),
        )

      case "isNoneOf":
        if (!Array.isArray(value)) return eb.lit(true)
        return eb.not(
          eb.exists(
            statusBase(eb, ctx).where(
              "bookToStatus.statusUuid",
              "in",
              value.map((v) => shelfValueText(v) as UUID),
            ),
          ),
        )

      default:
        return eb.lit(true)
    }
  },
}

function identifierBase(eb: EB, ctx: FieldSqlCtx) {
  return eb
    .selectFrom("identifier")
    .select(sql.lit(1).as("one"))
    .whereRef("identifier.bookUuid", "=", "book.uuid")
    .$if(!!ctx.qualifier, (qb) =>
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      qb.where("identifier.identifierTypeUuid", "=", ctx.qualifier! as UUID),
    )
    .$if(!!ctx.format, (qb) => {
      switch (ctx.format) {
        case "ebook":
          return qb.where("identifier.ebookUuid", "is not", null)
        case "audiobook":
          return qb.where("identifier.audiobookUuid", "is not", null)
        case "readaloud":
          return qb.where("identifier.readaloudUuid", "is not", null)
        default:
          return qb
      }
    })
}

function identifierCountFilters(ctx: FieldSqlCtx): RawBuilder<unknown> {
  const parts: RawBuilder<unknown>[] = []
  if (ctx.qualifier)
    parts.push(sql`and identifier_type_uuid = ${ctx.qualifier}`)
  if (ctx.format === "ebook") parts.push(sql`and ebook_uuid is not null`)
  if (ctx.format === "audiobook")
    parts.push(sql`and audiobook_uuid is not null`)
  if (ctx.format === "readaloud")
    parts.push(sql`and readaloud_uuid is not null`)
  return sql.join(parts, sql` `)
}

const lowerIdentifierValue = sql`lower(${sql.ref("identifier.value")})`

const identifiers: FieldSqlImpl = {
  isEmpty: (eb, ctx) => eb.not(eb.exists(identifierBase(eb, ctx))),
  compare: (eb, operator, value, ctx) => {
    const base = identifierBase(eb, ctx)
    const str = shelfValueText(value).toLowerCase()

    switch (operator) {
      case "is":
        return eb.exists(base.where(lowerIdentifierValue, "=", str))
      case "isNot":
        return eb.not(eb.exists(base.where(lowerIdentifierValue, "=", str)))
      case "contains":
        return eb.exists(base.where(lowerIdentifierValue, "like", `%${str}%`))
      case "notContains":
        return eb.not(
          eb.exists(base.where(lowerIdentifierValue, "like", `%${str}%`)),
        )
      case "startsWith":
        return eb.exists(base.where(lowerIdentifierValue, "like", `${str}%`))
      case "endsWith":
        return eb.exists(base.where(lowerIdentifierValue, "like", `%${str}`))
      case "isAnyOf": {
        if (!Array.isArray(value)) return eb.lit(true)
        return eb.exists(
          base.where(
            lowerIdentifierValue,
            "in",
            value.map((v) => shelfValueText(v).toLowerCase()),
          ),
        )
      }
      case "isNoneOf": {
        if (!Array.isArray(value)) return eb.lit(true)
        return eb.not(
          eb.exists(
            base.where(
              lowerIdentifierValue,
              "in",
              value.map((v) => shelfValueText(v).toLowerCase()),
            ),
          ),
        )
      }
      default:
        return eb.lit(true)
    }
  },
  count: (_eb, ctx) =>
    sql<number>`(select count(*) from identifier where book_uuid = book.uuid ${identifierCountFilters(ctx)})`,
}

export function formatPredicate(eb: EB, value: FormatValue): FilterExpression {
  const hasEbook = eb.exists(
    eb
      .selectFrom("ebook")
      .select(sql.lit(1).as("one"))
      .whereRef("ebook.bookUuid", "=", "book.uuid"),
  )
  const hasAudiobook = eb.exists(
    eb
      .selectFrom("audiobook")
      .select(sql.lit(1).as("one"))
      .whereRef("audiobook.bookUuid", "=", "book.uuid"),
  )
  const hasReadaloud = eb.exists(
    eb
      .selectFrom("readaloud")
      .select(sql.lit(1).as("one"))
      .whereRef("readaloud.bookUuid", "=", "book.uuid")
      .where("readaloud.status", "=", "ALIGNED"),
  )
  const hasReadaloudRow = eb.exists(
    eb
      .selectFrom("readaloud")
      .select(sql.lit(1).as("one"))
      .whereRef("readaloud.bookUuid", "=", "book.uuid"),
  )
  const missingEbook = eb.exists(
    eb
      .selectFrom("ebook")
      .select(sql.lit(1).as("one"))
      .whereRef("ebook.bookUuid", "=", "book.uuid")
      .where("ebook.missing", "=", true),
  )
  const missingAudiobook = eb.exists(
    eb
      .selectFrom("audiobook")
      .select(sql.lit(1).as("one"))
      .whereRef("audiobook.bookUuid", "=", "book.uuid")
      .where("audiobook.missing", "=", true),
  )
  const missingReadaloud = eb.exists(
    eb
      .selectFrom("readaloud")
      .select(sql.lit(1).as("one"))
      .whereRef("readaloud.bookUuid", "=", "book.uuid")
      .where("readaloud.missing", "=", true),
  )

  switch (value) {
    case "ebook":
      return hasEbook
    case "audiobook":
      return hasAudiobook
    case "readaloud":
      return hasReadaloud
    case "ebook-only":
      return eb.and([hasEbook, eb.not(hasAudiobook), eb.not(hasReadaloud)])
    case "audiobook-only":
      return eb.and([hasAudiobook, eb.not(hasEbook), eb.not(hasReadaloud)])
    case "readaloud-only":
      return eb.and([hasReadaloud, eb.not(hasEbook), eb.not(hasAudiobook)])
    case "missing-readaloud":
      return eb.and([hasEbook, hasAudiobook, eb.not(hasReadaloud)])
    case "missing-files":
      return eb.or([missingEbook, missingAudiobook, missingReadaloud])
    case "no-media":
      return eb.and([
        eb.not(hasEbook),
        eb.not(hasAudiobook),
        eb.not(hasReadaloudRow),
      ])
    default: {
      const _exhaustive: never = value
      return eb.lit(false)
    }
  }
}

function isFormatValue(value: unknown): value is FormatValue {
  return (
    typeof value === "string" &&
    (FORMAT_VALUES as readonly string[]).includes(value)
  )
}

const format: FieldSqlImpl = {
  isEmpty: (eb) => formatPredicate(eb, "no-media"),
  compare: (eb, operator, value) => {
    const condition = (v: unknown): FilterExpression =>
      isFormatValue(v) ? formatPredicate(eb, v) : eb.lit(false)

    switch (operator) {
      case "is":
        return condition(value)

      case "isNot":
        return eb.not(condition(value))

      case "isAnyOf":
        if (!Array.isArray(value)) return eb.lit(true)
        return eb.or(value.map(condition))

      case "isNoneOf":
        if (!Array.isArray(value)) return eb.lit(true)
        return eb.and(value.map((v) => eb.not(condition(v))))

      default:
        return eb.lit(true)
    }
  },
}

export function buildBookSearchExpression(
  eb: EB,
  term: string,
): FilterExpression {
  const searchTerm = `%${term.toLowerCase()}%`

  return eb.or([
    eb(sql`lower(book.title)`, "like", searchTerm),
    eb(sql`lower(book.subtitle)`, "like", searchTerm),
    eb.exists(
      eb
        .selectFrom("creator")
        .select(sql.lit(1).as("one"))
        .innerJoin("bookToCreator", "bookToCreator.creatorUuid", "creator.uuid")
        .whereRef("bookToCreator.bookUuid", "=", "book.uuid")
        .where(sql`lower(creator.name)`, "like", searchTerm),
    ),
    eb.exists(
      eb
        .selectFrom("series")
        .select(sql.lit(1).as("one"))
        .innerJoin("bookToSeries", "bookToSeries.seriesUuid", "series.uuid")
        .whereRef("bookToSeries.bookUuid", "=", "book.uuid")
        .where(sql`lower(series.name)`, "like", searchTerm),
    ),
    eb(sql`lower(book.description)`, "like", searchTerm),
  ])
}

const search: FieldSqlImpl = {
  isEmpty: (eb) => eb.lit(true),
  compare: (eb, _operator, value) => {
    const term = shelfValueText(value)
    return term ? buildBookSearchExpression(eb, term) : eb.lit(true)
  },
}

export const FIELD_SQL = {
  title: stringColumn("book.title"),
  subtitle: stringColumn("book.subtitle"),
  description: stringColumn("book.description"),
  language: stringColumn("book.language"),
  alignedWith: stringColumn("book.alignedWith"),
  alignedByStorytellerVersion: stringColumn("book.alignedByStorytellerVersion"),

  publicationDate: dateColumn("book.publicationDate"),
  createdAt: dateColumn("book.createdAt"),
  updatedAt: dateColumn("book.updatedAt"),
  alignedAt: dateColumn("book.alignedAt"),

  alignmentGrade: reportString("grade"),
  alignmentPreviousGrade: reportString("grade", 1),
  alignmentConfidence: reportNumber("confidence"),
  alignmentSentenceCoverage: reportNumber("sentence_coverage"),
  alignmentAudioCoverage: reportNumber("audio_coverage"),

  pageCount: assetNumeric("pageCount"),
  duration: assetNumeric("duration"),
  fileSize: assetNumeric("fileSize"),

  userRating,
  review,
  lastRead,
  readingPosition,

  tags,
  collections,
  series,
  creators,
  status,
  identifiers,

  format,
  search,
} as const satisfies Record<BaseField, FieldSqlImpl>
