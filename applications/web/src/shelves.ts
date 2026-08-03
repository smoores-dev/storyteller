// this file contains the shared logic for the shelf filter for the frontend and backend
// for backend only, see database/shelfFilter.ts

import { z } from "zod"

import {
  ALIGNMENT_GRADES,
  ARRAY_FIELDS,
  ASSET_FORMATS,
  type AssetFormat,
  CAN_BE_EMPTY_FIELDS,
  COUNTABLE_FIELDS,
  DATE_FIELDS,
  ENUM_FIELDS,
  FIELDS,
  FORMAT_VALUES,
  type FieldType,
  NUMBER_FIELDS,
  STRING_FIELDS,
  UUID_FIELDS,
  getFieldDef,
  getFieldType,
} from "./fields"
import { type RegistrySortField, SORTABLE_FIELDS } from "./sort"

export const shelfFilterFieldSchema = z.enum(FIELDS)

export type ShelfFilterField = z.infer<typeof shelfFilterFieldSchema>

export const shelfFilterOperatorSchema = z.enum([
  "is",
  "isNot",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
  "greaterOrEqual",
  "lessOrEqual",
  "between",
  "before",
  "after",
  "includes",
  "includesAll",
  "excludes",
  "intersects",
  "isAnyOf",
  "isNoneOf",
  "isEmpty",
  "isNotEmpty",
])

export type ShelfFilterOperator = z.infer<typeof shelfFilterOperatorSchema>

export const TEXT_MATCH_OPERATORS = [
  "is",
  "isNot",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
] as const

export const TEXT_LIST_OPERATORS = ["isAnyOf", "isNoneOf"] as const

export const NUMBER_COMPARE_OPERATORS = [
  "is",
  "isNot",
  "greaterThan",
  "lessThan",
  "greaterOrEqual",
  "lessOrEqual",
] as const

export const RANGE_OPERATORS = ["between"] as const

export const DATE_COMPARE_OPERATORS = [
  "is",
  "isNot",
  "before",
  "after",
] as const

export const UUID_MATCH_OPERATORS = ["is", "isNot"] as const
export const UUID_LIST_OPERATORS = ["isAnyOf", "isNoneOf"] as const

export const ARRAY_OPERATORS = ["includes", "includesAll", "excludes"] as const

export const ENUM_MATCH_OPERATORS = ["is", "isNot"] as const
export const ENUM_LIST_OPERATORS = ["isAnyOf", "isNoneOf"] as const

export const SEARCH_OPERATORS = ["contains"] as const

export const UNARY_OPERATORS = ["isEmpty", "isNotEmpty"] as const

export const OPERATORS_BY_FIELD_TYPE = {
  string: [...TEXT_MATCH_OPERATORS, ...TEXT_LIST_OPERATORS, ...UNARY_OPERATORS],
  number: [...NUMBER_COMPARE_OPERATORS, ...RANGE_OPERATORS, ...UNARY_OPERATORS],
  date: [...DATE_COMPARE_OPERATORS, ...RANGE_OPERATORS, ...UNARY_OPERATORS],
  uuid: [...UUID_MATCH_OPERATORS, ...UUID_LIST_OPERATORS, ...UNARY_OPERATORS],
  array: [...ARRAY_OPERATORS, ...UNARY_OPERATORS],
  enum: [...ENUM_MATCH_OPERATORS, ...ENUM_LIST_OPERATORS],
} as const satisfies Record<FieldType, ShelfFilterOperator[]>

export type NumberOperators = (typeof OPERATORS_BY_FIELD_TYPE)["number"][number]
export type DateOperators = (typeof OPERATORS_BY_FIELD_TYPE)["date"][number]
export type UUIDOperators = (typeof OPERATORS_BY_FIELD_TYPE)["uuid"][number]
export type ArrayOperators = (typeof OPERATORS_BY_FIELD_TYPE)["array"][number]
export type EnumOperators = (typeof OPERATORS_BY_FIELD_TYPE)["enum"][number]

// ---------------------------------------------------------------------------
// value + condition schemas (strict)
// ---------------------------------------------------------------------------

// a condition value can reference another field address instead of a literal:
// "duration@readaloud between 0.8x and 1.2x of duration@audiobook", or
// "creators@aut intersects creators@nrt". field defaults to the condition's
// own field, so cross-qualifier / cross-format comparisons stay terse.
export const fieldRefSchema = z.object({
  ref: z.object({
    field: z
      .string()
      .optional()
      .describe("the referenced field; defaults to the condition's own field"),
    qualifier: z.string().optional(),
    format: z.enum(ASSET_FORMATS).optional(),
  }),
  factor: z
    .number()
    .optional()
    .describe("multiplier applied to the referenced value (0.8 = 80%)"),
})

export type ShelfFilterFieldRef = z.infer<typeof fieldRefSchema>

export function isFieldRefValue(v: unknown): v is ShelfFilterFieldRef {
  return typeof v === "object" && v !== null && !Array.isArray(v) && "ref" in v
}

/** a condition value (or one member of one) as text; refs/nulls become "". */
export function shelfValueText(v: unknown): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : ""
}

const numberOrRef = z.union([z.number(), fieldRefSchema])

export const shelfFilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.union([z.string(), z.number()])),
  z.tuple([z.string(), z.string()]),
  z.tuple([z.number(), z.number()]),
  fieldRefSchema,
  z.tuple([numberOrRef, numberOrRef]),
  z.null(),
])

export type ShelfFilterValue = z.infer<typeof shelfFilterValueSchema>

const TYPE = z.literal("condition")

// a condition addresses a value by field x qualifier x format. the qualifier
// narrows to one sub-key of the field (a marc relator role for creators, a
// rating axis for userRating, an identifier type for identifiers); the format
// scopes to one asset's copy of the value. which fields accept which axis is
// declared in the field registry.
const qualifierProp = {
  qualifier: z
    .string()
    .optional()
    .describe(
      "sub-key of the field: a marc relator role (aut/nrt/trl) for creators, a rating axis id for userRating, an identifier type uuid for identifiers",
    ),
}

const formatProp = {
  format: z
    .enum(ASSET_FORMATS)
    .optional()
    .describe(
      "scope the value to one asset format (ebook/audiobook/readaloud)",
    ),
}

const stringMatchCondition = z
  .object({
    type: TYPE,
    field: z.enum(STRING_FIELDS),
    operator: z.enum(TEXT_MATCH_OPERATORS),
    value: z.string().describe("the text to match against the field"),
    ...qualifierProp,
    ...formatProp,
  })
  .describe("text match on a string field (title, subtitle, identifiers, ...)")

const stringListCondition = z
  .object({
    type: TYPE,
    field: z.enum(STRING_FIELDS),
    operator: z.enum(TEXT_LIST_OPERATORS),
    value: z.array(z.string()).describe("the set of candidate values"),
    ...qualifierProp,
    ...formatProp,
  })
  .describe("membership test on a string field (is any of / is none of)")

const numberCompareCondition = z
  .object({
    type: TYPE,
    field: z.enum(NUMBER_FIELDS),
    operator: z.enum(NUMBER_COMPARE_OPERATORS),
    value: numberOrRef.describe(
      "the number to compare against, or a reference to another field's value",
    ),
    ...qualifierProp,
    ...formatProp,
  })
  .describe("scalar comparison on a numeric field")

const numberRangeCondition = z
  .object({
    type: TYPE,
    field: z.enum(NUMBER_FIELDS),
    operator: z.enum(RANGE_OPERATORS),
    value: z
      .tuple([numberOrRef, numberOrRef])
      .describe(
        "inclusive [min, max] range; bounds may reference other fields",
      ),
    ...qualifierProp,
    ...formatProp,
  })
  .describe("range (between) on a numeric field")

const dateCompareCondition = z
  .object({
    type: TYPE,
    field: z.enum(DATE_FIELDS),
    operator: z.enum(DATE_COMPARE_OPERATORS),
    value: z.string().describe("an ISO date string"),
  })
  .describe("scalar comparison on a date field")

const dateRangeCondition = z
  .object({
    type: TYPE,
    field: z.enum(DATE_FIELDS),
    operator: z.enum(RANGE_OPERATORS),
    value: z
      .tuple([z.string(), z.string()])
      .describe("inclusive [from, to] ISO date range"),
  })
  .describe("range (between) on a date field")

const uuidMatchCondition = z
  .object({
    type: TYPE,
    field: z.enum(UUID_FIELDS),
    operator: z.enum(UUID_MATCH_OPERATORS),
    value: z.string().describe("the entity uuid"),
  })
  .describe("scalar match on a uuid field (reading status)")

const uuidListCondition = z
  .object({
    type: TYPE,
    field: z.enum(UUID_FIELDS),
    operator: z.enum(UUID_LIST_OPERATORS),
    value: z.array(z.string()).describe("a set of entity uuids"),
  })
  .describe("membership test on a uuid field")

const arrayCondition = z
  .object({
    type: TYPE,
    field: z.enum(ARRAY_FIELDS),
    operator: z.enum(ARRAY_OPERATORS),
    value: z.array(z.string()).describe("the related entity uuids"),
    ...qualifierProp,
  })
  .describe("relation membership (tags, collections, series, creators)")

const relationOverlapCondition = z
  .object({
    type: TYPE,
    field: z.enum(ARRAY_FIELDS),
    operator: z.literal("intersects"),
    value: fieldRefSchema.describe(
      "the other side of the overlap, e.g. { ref: { qualifier: 'nrt' } }",
    ),
    ...qualifierProp,
  })
  .describe(
    "the relation's values overlap another qualifier's values (the author is also the narrator)",
  )

// enum fields: format (format values) and alignmentGrade (letter grades)
const ENUM_VALUES = [...FORMAT_VALUES, ...ALIGNMENT_GRADES] as const

const enumMatchCondition = z
  .object({
    type: TYPE,
    field: z.enum(ENUM_FIELDS),
    operator: z.enum(ENUM_MATCH_OPERATORS),
    value: z.enum(ENUM_VALUES).describe("a format or alignment grade"),
  })
  .describe("scalar match on an enum field (format / alignment grade)")

const enumListCondition = z
  .object({
    type: TYPE,
    field: z.enum(ENUM_FIELDS),
    operator: z.enum(ENUM_LIST_OPERATORS),
    value: z
      .array(z.enum(ENUM_VALUES))
      .describe("a set of formats or alignment grades"),
  })
  .describe("membership test on an enum field (format / alignment grade)")

const reviewCondition = z
  .object({
    type: TYPE,
    field: z.literal("review"),
    operator: z.enum(TEXT_MATCH_OPERATORS),
    value: z.string().describe("text to match in the user's review"),
  })
  .describe("text match on the user's review")

const searchCondition = z
  .object({
    type: TYPE,
    field: z.literal("search"),
    operator: z.enum(SEARCH_OPERATORS),
    value: z
      .string()
      .describe("free-text query matched against title/author/series"),
  })
  .describe("generic free-text search across the book")

const unaryCondition = z
  .object({
    type: TYPE,
    field: z.enum(CAN_BE_EMPTY_FIELDS),
    operator: z.enum(UNARY_OPERATORS),
    ...qualifierProp,
    ...formatProp,
  })
  .describe("presence test (is empty / is not empty)")

const countCondition = z
  .object({
    type: TYPE,
    field: z.enum(COUNTABLE_FIELDS),
    aggregate: z.literal("count"),
    operator: z.enum([...NUMBER_COMPARE_OPERATORS, ...RANGE_OPERATORS]),
    value: z
      .union([z.number(), z.tuple([z.number(), z.number()])])
      .describe(
        "how many related values (a number, or [min, max] for between)",
      ),
    ...qualifierProp,
    ...formatProp,
  })
  .describe(
    "compare how MANY related values a book has (more than 3 authors), not which ones",
  )

const conditionVariants = z.union([
  countCondition,
  stringMatchCondition,
  stringListCondition,
  numberCompareCondition,
  numberRangeCondition,
  dateCompareCondition,
  dateRangeCondition,
  uuidMatchCondition,
  uuidListCondition,
  arrayCondition,
  relationOverlapCondition,
  enumMatchCondition,
  enumListCondition,
  reviewCondition,
  searchCondition,
  unaryCondition,
])

export const shelfFilterConditionSchema = z.preprocess((val) => {
  if (!val || typeof val !== "object") return val
  let obj = val as Record<string, unknown>

  // we dont look at the main rating field, only the user's rating
  if (obj["field"] === "rating") {
    obj = { ...obj, field: "userRating" }
  }

  // pre-qualifier filters carried the axis under bespoke keys; fold them into
  // the canonical `qualifier`
  if (obj["field"] === "ratingDimension") {
    const { dimension, ...rest } = obj
    obj = { ...rest, field: "userRating", qualifier: dimension }
  }
  if ("role" in obj) {
    const { role, ...rest } = obj
    obj = { ...rest, ...(role != null ? { qualifier: role } : {}) }
  }
  if ("dimension" in obj) {
    const { dimension, ...rest } = obj
    obj = { ...rest, ...(dimension != null ? { qualifier: dimension } : {}) }
  }

  // the short-lived identifierName/identifierValue split; both are now the
  // identifiers field. old value payloads (type names) don't translate, so
  // value-carrying conditions degrade to a presence test.
  if (obj["field"] === "identifierName" || obj["field"] === "identifierValue") {
    const op = obj["operator"]
    const { value: _omit, ...rest } = obj
    obj = {
      ...rest,
      field: "identifiers",
      operator: op === "isEmpty" ? "isEmpty" : "isNotEmpty",
    }
  }

  const op = obj["operator"]
  if ((op === "isEmpty" || op === "isNotEmpty") && "value" in obj) {
    const { value: _omit, ...rest } = obj
    return rest
  }

  return obj
}, conditionVariants)

export type ShelfFilterCondition = {
  type: "condition"
  field: ShelfFilterField
  operator: ShelfFilterOperator
  value?: ShelfFilterValue
  /** sub-key of the field; see the registry's qualifier declaration. */
  qualifier?: string
  /** scope the value to one asset format. */
  format?: AssetFormat
  /** compare the cardinality of a relation instead of its values. */
  aggregate?: "count"
}

export type ShelfFilterAnd = {
  type: "and"
  children: ShelfFilterNode[]
}

export type ShelfFilterOr = {
  type: "or"
  children: ShelfFilterNode[]
}

export type ShelfFilterNot = {
  type: "not"
  child: ShelfFilterNode
}

export type ShelfFilterNode =
  | ShelfFilterCondition
  | ShelfFilterAnd
  | ShelfFilterOr
  | ShelfFilterNot

export type ShelfFilter = ShelfFilterNode

export const shelfFilterNodeSchema: z.ZodType<ShelfFilterNode> = z.lazy(() =>
  z.union([
    shelfFilterConditionSchema,
    z.object({
      type: z.literal("and"),
      children: z.array(shelfFilterNodeSchema),
    }),
    z.object({
      type: z.literal("or"),
      children: z.array(shelfFilterNodeSchema),
    }),
    z.object({
      type: z.literal("not"),
      child: shelfFilterNodeSchema,
    }),
  ]),
)

export const shelfFilterBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("and"),
    children: z.array(shelfFilterNodeSchema),
  }),
  z.object({
    type: z.literal("or"),
    children: z.array(shelfFilterNodeSchema),
  }),
  z.object({
    type: z.literal("not"),
    child: shelfFilterNodeSchema,
  }),
])

// a stored filter is always a block, but callers may hand us a bare condition
// (pinning a facet as a shelf); wrap it instead of rejecting it.
export const shelfFilterRootSchema = z.preprocess((val) => {
  if (
    val &&
    typeof val === "object" &&
    (val as { type?: unknown }).type === "condition"
  ) {
    return { type: "and", children: [val] }
  }
  return val
}, shelfFilterBlockSchema)

export const shelfFilterSchema = shelfFilterRootSchema

export const OPERATOR_LABELS: Record<ShelfFilterOperator, string> = {
  is: "is",
  isNot: "is not",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  greaterThan: "greater than",
  lessThan: "less than",
  greaterOrEqual: "at least",
  lessOrEqual: "at most",
  between: "between",
  before: "before",
  after: "after",
  includes: "includes any of",
  includesAll: "includes all of",
  excludes: "excludes",
  intersects: "overlaps with",
  isAnyOf: "is any of",
  isNoneOf: "is none of",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
}

export function getOperatorsForField(
  field: ShelfFilterField,
): ShelfFilterOperator[] {
  if (field === "review") {
    return [...TEXT_MATCH_OPERATORS, ...UNARY_OPERATORS]
  }
  if (field === "search") {
    return [...SEARCH_OPERATORS]
  }

  const fieldType = getFieldType(field)
  return [...OPERATORS_BY_FIELD_TYPE[fieldType]]
}

export function operatorRequiresValue(operator: ShelfFilterOperator): boolean {
  return operator !== "isEmpty" && operator !== "isNotEmpty"
}

export function operatorRequiresArrayValue(
  operator: ShelfFilterOperator,
): boolean {
  return (
    operator === "isAnyOf" ||
    operator === "isNoneOf" ||
    operator === "includes" ||
    operator === "includesAll" ||
    operator === "excludes"
  )
}

export function operatorRequiresRangeValue(
  operator: ShelfFilterOperator,
): boolean {
  return operator === "between"
}

export function defaultOperatorForField(
  field: ShelfFilterField,
): ShelfFilterOperator {
  if (field === "search" || field === "review") return "contains"

  const registryDefault = getFieldDef(field).defaultOperator
  if (registryDefault) return registryDefault

  switch (getFieldType(field)) {
    case "string":
      return "contains"
    case "number":
    case "date":
      return "between"
    case "array":
      return "includes"
    case "enum":
      return "isAnyOf"
    case "uuid":
      return "is"
  }
}

// the starting value shape for a freshly-added operator, so the condition is
// well-formed (if not yet complete) the moment it appears in the editor.
function initialValueForOperator(
  operator: ShelfFilterOperator,
): ShelfFilterValue | undefined {
  if (!operatorRequiresValue(operator)) return undefined
  if (operatorRequiresArrayValue(operator)) return []
  if (operatorRequiresRangeValue(operator)) return undefined
  return ""
}

export function createEmptyCondition(
  field: ShelfFilterField = "title",
): ShelfFilterCondition {
  const operator = defaultOperatorForField(field)
  return {
    type: "condition",
    field,
    operator,
    value: initialValueForOperator(operator),
  }
}

export function createAndBlock(
  children: ShelfFilterNode[] = [createEmptyCondition()],
): ShelfFilterAnd {
  return { type: "and", children }
}

export function createOrBlock(
  children: ShelfFilterNode[] = [createEmptyCondition()],
): ShelfFilterOr {
  return { type: "or", children }
}

export function createNotBlock(
  child: ShelfFilterNode = createEmptyCondition(),
): ShelfFilterNot {
  return { type: "not", child }
}

export function isLogicalBlock(
  node: ShelfFilterNode,
): node is ShelfFilterAnd | ShelfFilterOr | ShelfFilterNot {
  return node.type === "and" || node.type === "or" || node.type === "not"
}

export function createDefaultFilter(): ShelfFilterAnd {
  return createAndBlock()
}

export function normalizeRootFilter(
  node: ShelfFilterNode | null,
): ShelfFilterAnd | ShelfFilterOr | ShelfFilterNot {
  if (!node) return createDefaultFilter()
  if (node.type === "condition") return createAndBlock([node])
  return node
}

export type ShelfOrderBy = RegistrySortField | "position"

export const SHELF_ORDER_BY_FIELDS = [
  ...SORTABLE_FIELDS,
  "position",
] as unknown as [ShelfOrderBy, ...ShelfOrderBy[]]

export const HomeSectionKind = [
  "hero",
  "stats",
  "currentlyReading",
  "nextUpInSeries",
  "recentlyAdded",
  "custom",
  "getStarted",
  "addSection",
] as const

export type AlignmentGrade = (typeof ALIGNMENT_GRADES)[number]

export type HomeSectionKind = (typeof HomeSectionKind)[number]
