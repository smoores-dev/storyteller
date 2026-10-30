import assert from "node:assert"

import Database from "better-sqlite3"
import { describe, it } from "vitest"

import { type BookWithRelations } from "@/database/books"
import { createKyselyDb } from "@/database/factory"
import {
  buildFilterExpression,
  buildSortExpression,
  extractEntityReferences,
  removeDeletedEntityReferences,
} from "@/database/shelfFilter"
import {
  FIELDS,
  FIELD_REGISTRY,
  FORMAT_VALUES,
  getFieldDef,
  getFieldType,
} from "@/fields"
import {
  type ShelfFilterField,
  ShelfFilterInvalidError,
  type ShelfFilterNode,
  collectFilterIssues,
  createAndBlock,
  createEmptyCondition,
  createNotBlock,
  createOrBlock,
  getOperatorsForField,
  isLogicalBlock,
  operatorRequiresArrayValue,
  operatorRequiresRangeValue,
  operatorRequiresValue,
  shelfFilterConditionSchema,
  shelfFilterFieldSchema,
  shelfFilterNodeSchema,
  shelfFilterOperatorSchema,
  shelfFilterValueSchema,
} from "@/shelves"
import {
  SORTABLE_FIELDS,
  type SortField,
  displaySeriesOf,
  makeBookComparator,
} from "@/sort"
import { type UUID } from "@/uuid"

describe("shelfFilterFieldSchema", () => {
  it("accepts all known fields", () => {
    const knownFields = Object.keys(FIELD_REGISTRY) as ShelfFilterField[]

    for (const field of knownFields) {
      const result = shelfFilterFieldSchema.safeParse(field)
      assert.ok(result.success, `field "${field}" should be valid`)
    }
  })

  it("rejects unknown fields", () => {
    const result = shelfFilterFieldSchema.safeParse("nonexistent")
    assert.ok(!result.success)
  })

  it("includes the new fields", () => {
    for (const field of ["userRating", "duration", "pageCount", "fileSize"]) {
      const result = shelfFilterFieldSchema.safeParse(field)
      assert.ok(result.success, `field "${field}" should be valid`)
    }
  })
})

describe("shelfFilterOperatorSchema", () => {
  it("accepts isEmpty and isNotEmpty", () => {
    assert.ok(shelfFilterOperatorSchema.safeParse("isEmpty").success)
    assert.ok(shelfFilterOperatorSchema.safeParse("isNotEmpty").success)
  })

  it("rejects unknown operators", () => {
    assert.ok(!shelfFilterOperatorSchema.safeParse("matches").success)
  })
})

describe("shelfFilterValueSchema", () => {
  it("accepts a string", () => {
    assert.ok(shelfFilterValueSchema.safeParse("hello").success)
  })

  it("accepts a number", () => {
    assert.ok(shelfFilterValueSchema.safeParse(42).success)
  })

  it("accepts null", () => {
    assert.ok(shelfFilterValueSchema.safeParse(null).success)
  })

  it("accepts an array of strings", () => {
    assert.ok(shelfFilterValueSchema.safeParse(["a", "b"]).success)
  })

  it("accepts a mixed array", () => {
    assert.ok(shelfFilterValueSchema.safeParse(["a", 1]).success)
  })

  it("accepts a tuple of two numbers", () => {
    assert.ok(shelfFilterValueSchema.safeParse([0, 5]).success)
  })
})

describe("shelfFilterConditionSchema", () => {
  it("accepts a valid condition", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "title",
      operator: "contains",
      value: "test",
    })

    assert.ok(result.success)
  })

  it("accepts a condition without value", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "title",
      operator: "isEmpty",
    })

    assert.ok(result.success)
  })

  it("rejects an invalid field", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "invalidField",
      operator: "is",
      value: "x",
    })

    assert.ok(!result.success)
  })
})

describe("shelfFilterNodeSchema", () => {
  it("accepts a simple condition", () => {
    const result = shelfFilterNodeSchema.safeParse({
      type: "condition",
      field: "userRating",
      operator: "greaterOrEqual",
      value: 3,
    })

    assert.ok(result.success)
  })

  it("coerces the legacy aggregate rating field to userRating", () => {
    const result = shelfFilterNodeSchema.safeParse({
      type: "condition",
      field: "rating",
      operator: "greaterOrEqual",
      value: 3,
    })

    assert.ok(result.success)
    assert.strictEqual((result.data as { field: string }).field, "userRating")
  })

  it("accepts an AND block with children", () => {
    const result = shelfFilterNodeSchema.safeParse({
      type: "and",
      children: [
        { type: "condition", field: "title", operator: "contains", value: "a" },
        { type: "condition", field: "userRating", operator: "is", value: 5 },
      ],
    })

    assert.ok(result.success)
  })

  it("accepts an OR block", () => {
    const result = shelfFilterNodeSchema.safeParse({
      type: "or",
      children: [
        { type: "condition", field: "language", operator: "is", value: "en" },
      ],
    })

    assert.ok(result.success)
  })

  it("accepts a NOT block", () => {
    const result = shelfFilterNodeSchema.safeParse({
      type: "not",
      child: {
        type: "condition",
        field: "tags",
        operator: "includes",
        value: ["uuid-1"],
      },
    })

    assert.ok(result.success)
  })

  it("accepts deeply nested trees", () => {
    const result = shelfFilterNodeSchema.safeParse({
      type: "and",
      children: [
        {
          type: "or",
          children: [
            {
              type: "not",
              child: {
                type: "condition",
                field: "userRating",
                operator: "greaterThan",
                value: 3,
              },
            },
            {
              type: "condition",
              field: "duration",
              operator: "between",
              value: [0, 7200],
            },
          ],
        },
        {
          type: "condition",
          field: "fileSize",
          operator: "lessThan",
          value: 50000000,
        },
      ],
    })

    assert.ok(result.success)
  })

  it("rejects an invalid discriminator type", () => {
    const result = shelfFilterNodeSchema.safeParse({
      type: "xor",
      children: [],
    })

    assert.ok(!result.success)
  })
})

describe("getFieldType", () => {
  it("classifies string fields", () => {
    assert.strictEqual(getFieldType("title"), "string")
    assert.strictEqual(getFieldType("subtitle"), "string")
    assert.strictEqual(getFieldType("description"), "string")
    assert.strictEqual(getFieldType("language"), "string")
  })

  it("classifies number fields", () => {
    assert.strictEqual(getFieldType("userRating"), "number")
    assert.strictEqual(getFieldType("duration"), "number")
    assert.strictEqual(getFieldType("pageCount"), "number")
    assert.strictEqual(getFieldType("fileSize"), "number")
  })

  it("classifies date fields", () => {
    assert.strictEqual(getFieldType("publicationDate"), "date")
  })

  it("classifies uuid fields", () => {
    assert.strictEqual(getFieldType("status"), "uuid")
  })

  it("classifies array fields", () => {
    assert.strictEqual(getFieldType("tags"), "array")
    assert.strictEqual(getFieldType("collections"), "array")
    assert.strictEqual(getFieldType("series"), "array")
    assert.strictEqual(getFieldType("creators"), "array")
  })

  it("classifies enum fields", () => {
    assert.strictEqual(getFieldType("format"), "enum")
  })
})

describe("getOperatorsForField", () => {
  it("returns string operators for title", () => {
    const ops = getOperatorsForField("title")
    assert.ok(ops.includes("contains"))
    assert.ok(ops.includes("startsWith"))
    assert.ok(!ops.includes("greaterThan"))
  })

  it("returns number operators for userRating", () => {
    const ops = getOperatorsForField("userRating")
    assert.ok(ops.includes("greaterThan"))
    assert.ok(ops.includes("between"))
    assert.ok(!ops.includes("contains"))
  })

  it("returns number operators for duration", () => {
    const ops = getOperatorsForField("duration")
    assert.ok(ops.includes("greaterOrEqual"))
    assert.ok(ops.includes("lessOrEqual"))
  })

  it("returns array operators for tags", () => {
    const ops = getOperatorsForField("tags")
    assert.ok(ops.includes("includes"))
    assert.ok(ops.includes("includesAll"))
    assert.ok(ops.includes("excludes"))
    assert.ok(!ops.includes("is"))
  })
})

describe("operatorRequiresValue", () => {
  it("returns false for isEmpty and isNotEmpty", () => {
    assert.strictEqual(operatorRequiresValue("isEmpty"), false)
    assert.strictEqual(operatorRequiresValue("isNotEmpty"), false)
  })

  it("returns true for all other operators", () => {
    assert.strictEqual(operatorRequiresValue("is"), true)
    assert.strictEqual(operatorRequiresValue("contains"), true)
    assert.strictEqual(operatorRequiresValue("greaterThan"), true)
  })
})

describe("operatorRequiresArrayValue", () => {
  it("returns true for multi-value operators", () => {
    assert.strictEqual(operatorRequiresArrayValue("isAnyOf"), true)
    assert.strictEqual(operatorRequiresArrayValue("isNoneOf"), true)
    assert.strictEqual(operatorRequiresArrayValue("includes"), true)
    assert.strictEqual(operatorRequiresArrayValue("includesAll"), true)
    assert.strictEqual(operatorRequiresArrayValue("excludes"), true)
  })

  it("returns false for single-value operators", () => {
    assert.strictEqual(operatorRequiresArrayValue("is"), false)
    assert.strictEqual(operatorRequiresArrayValue("contains"), false)
  })
})

describe("operatorRequiresRangeValue", () => {
  it("returns true only for between", () => {
    assert.strictEqual(operatorRequiresRangeValue("between"), true)
    assert.strictEqual(operatorRequiresRangeValue("is"), false)
    assert.strictEqual(operatorRequiresRangeValue("greaterThan"), false)
  })
})

describe("createEmptyCondition", () => {
  it("creates a default title/contains condition", () => {
    const cond = createEmptyCondition()
    assert.strictEqual(cond.type, "condition")
    assert.strictEqual(cond.field, "title")
    assert.strictEqual(cond.operator, "contains")
    assert.strictEqual(cond.value, "")
  })
})

describe("createAndBlock", () => {
  it("creates an AND block with a default child", () => {
    const block = createAndBlock()
    assert.strictEqual(block.type, "and")
    assert.strictEqual(block.children.length, 1)
    assert.strictEqual(block.children[0]!.type, "condition")
  })

  it("accepts custom children", () => {
    const children: ShelfFilterNode[] = [
      { type: "condition", field: "title", operator: "is", value: "A" },
      { type: "condition", field: "userRating", operator: "is", value: 5 },
    ]

    const block = createAndBlock(children)
    assert.strictEqual(block.children.length, 2)
  })
})

describe("createOrBlock", () => {
  it("creates an OR block with a default child", () => {
    const block = createOrBlock()
    assert.strictEqual(block.type, "or")
    assert.strictEqual(block.children.length, 1)
  })
})

describe("createNotBlock", () => {
  it("creates a NOT block with a default child", () => {
    const block = createNotBlock()
    assert.strictEqual(block.type, "not")
    assert.strictEqual(block.child.type, "condition")
  })
})

describe("isLogicalBlock", () => {
  it("returns true for and, or, not", () => {
    assert.ok(isLogicalBlock(createAndBlock()))
    assert.ok(isLogicalBlock(createOrBlock()))
    assert.ok(isLogicalBlock(createNotBlock()))
  })

  it("returns false for conditions", () => {
    assert.ok(!isLogicalBlock(createEmptyCondition()))
  })
})

describe("extractEntityReferences", () => {
  it("extracts tag references from a condition", () => {
    const refs = extractEntityReferences({
      type: "condition",
      field: "tags",
      operator: "includes",
      value: ["tag-1", "tag-2"],
    })

    assert.strictEqual(refs.length, 2)
    assert.strictEqual(refs[0]!.entityType, "tag")
    assert.strictEqual(refs[0]!.entityUuid, "tag-1")
    assert.strictEqual(refs[1]!.entityType, "tag")
    assert.strictEqual(refs[1]!.entityUuid, "tag-2")
  })

  it("extracts references from nested trees", () => {
    const refs = extractEntityReferences({
      type: "and",
      children: [
        {
          type: "condition",
          field: "collections",
          operator: "includes",
          value: ["col-1"],
        },
        {
          type: "not",
          child: {
            type: "condition",
            field: "creators",
            operator: "excludes",
            value: ["creator-1"],
          },
        },
      ],
    })

    assert.strictEqual(refs.length, 2)
    assert.deepStrictEqual(refs[0], {
      entityType: "collection",
      entityUuid: "col-1",
    })
    assert.deepStrictEqual(refs[1], {
      entityType: "creator",
      entityUuid: "creator-1",
    })
  })

  it("returns empty for non-entity fields", () => {
    const refs = extractEntityReferences({
      type: "condition",
      field: "title",
      operator: "contains",
      value: "something",
    })

    assert.strictEqual(refs.length, 0)
  })

  it("handles status uuid field", () => {
    const refs = extractEntityReferences({
      type: "condition",
      field: "status",
      operator: "is",
      value: "status-uuid-1",
    })

    assert.strictEqual(refs.length, 1)
    assert.strictEqual(refs[0]!.entityType, "status")
    assert.strictEqual(refs[0]!.entityUuid, "status-uuid-1")
  })

  it("ignores numeric fields", () => {
    const refs = extractEntityReferences({
      type: "condition",
      field: "userRating",
      operator: "greaterThan",
      value: 3,
    })

    assert.strictEqual(refs.length, 0)
  })
})

describe("removeDeletedEntityReferences", () => {
  it("removes a tag from a condition", () => {
    const result = removeDeletedEntityReferences(
      {
        type: "condition",
        field: "tags",
        operator: "includes",
        value: ["tag-1", "tag-2"],
      },
      "tag",
      "tag-1",
    )

    assert.ok(result)
    assert.strictEqual(result.type, "condition")
    assert.deepStrictEqual((result as { value: string[] }).value, ["tag-2"])
  })

  it("returns null when all values removed from a condition", () => {
    const result = removeDeletedEntityReferences(
      {
        type: "condition",
        field: "tags",
        operator: "includes",
        value: ["tag-1"],
      },
      "tag",
      "tag-1",
    )

    assert.strictEqual(result, null)
  })

  it("removes a child from an AND block", () => {
    const result = removeDeletedEntityReferences(
      {
        type: "and",
        children: [
          {
            type: "condition",
            field: "tags",
            operator: "includes",
            value: ["tag-1"],
          },
          {
            type: "condition",
            field: "title",
            operator: "contains",
            value: "hello",
          },
        ],
      },
      "tag",
      "tag-1",
    )

    assert.ok(result)
    assert.strictEqual(result.type, "and")

    const andBlock = result as { children: ShelfFilterNode[] }
    assert.strictEqual(andBlock.children.length, 1)
    assert.strictEqual(andBlock.children[0]!.type, "condition")
  })

  it("leaves unrelated fields untouched", () => {
    const original: ShelfFilterNode = {
      type: "condition",
      field: "collections",
      operator: "includes",
      value: ["col-1"],
    }

    const result = removeDeletedEntityReferences(original, "tag", "tag-1")

    assert.ok(result)
    assert.deepStrictEqual(result, original)
  })
})

describe("FIELD_REGISTRY", () => {
  it("has an entry for every field in the schema", () => {
    const fields = shelfFilterFieldSchema.options

    for (const field of fields) {
      assert.ok(
        field in FIELD_REGISTRY,
        `FIELD_REGISTRY missing entry for "${field}"`,
      )
    }
  })

  it("has no extra entries beyond the schema", () => {
    const fields = new Set(shelfFilterFieldSchema.options)

    for (const key of Object.keys(FIELD_REGISTRY)) {
      assert.ok(
        fields.has(key as ShelfFilterField),
        `FIELD_REGISTRY has extra entry "${key}" not in schema`,
      )
    }
  })

  it("declares a control that matches the field's value type", () => {
    for (const field of shelfFilterFieldSchema.options) {
      const def = FIELD_REGISTRY[field]
      const type = getFieldType(field)
      if (def.control === "facet") {
        if (def.source === "distinct") {
          assert.equal(type, "string", field)
        } else if ("qualifier" in def) {
          assert.ok(
            type === "array" || type === "uuid" || type === "string",
            `${field}: qualified facet expects array/uuid/string, got ${type}`,
          )
        } else {
          assert.ok(
            type === "array" || type === "uuid",
            `${field}: facet control expects array/uuid, got ${type}`,
          )
        }
      }
      if (def.control === "enum") assert.equal(type, "enum", field)
    }
  })
})

describe("strict condition schema", () => {
  it("rejects an operator the field type does not support", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "pageCount",
      operator: "endsWith",
      value: "x",
    })
    assert.ok(!result.success)
  })

  it("rejects a between range with the wrong arity", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "duration",
      operator: "between",
      value: [1],
    })
    assert.ok(!result.success)
  })

  it("rejects an invalid format value", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "format",
      operator: "is",
      value: "paper",
    })
    assert.ok(!result.success)
  })

  it("rejects a numeric field with a string value", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "pageCount",
      operator: "is",
      value: "ten",
    })
    assert.ok(!result.success)
  })

  it("accepts review presence and content", () => {
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "review",
        operator: "isNotEmpty",
      }).success,
    )
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "review",
        operator: "contains",
        value: "great",
      }).success,
    )
  })

  it("accepts a qualified rating condition (one axis)", () => {
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "userRating",
        qualifier: "plot",
        operator: "greaterOrEqual",
        value: 4,
      }).success,
    )
  })

  it("maps a legacy ratingDimension condition to a qualified userRating", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "ratingDimension",
      dimension: "plot",
      operator: "greaterOrEqual",
      value: 4,
    })
    assert.ok(result.success)
    const cond = result.data as { field: string; qualifier?: string }
    assert.strictEqual(cond.field, "userRating")
    assert.strictEqual(cond.qualifier, "plot")
  })

  it("maps a legacy role key to the qualifier", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "creators",
      operator: "includes",
      value: ["33333333-3333-3333-3333-333333333333"],
      role: "nrt",
    })
    assert.ok(result.success)
    const cond = result.data as { qualifier?: string; role?: string }
    assert.strictEqual(cond.qualifier, "nrt")
    assert.ok(!("role" in cond))
  })

  it("maps legacy identifierName/identifierValue to an identifiers presence test", () => {
    const result = shelfFilterConditionSchema.safeParse({
      type: "condition",
      field: "identifierName",
      operator: "is",
      value: "ISBN-13",
    })
    assert.ok(result.success)
    const cond = result.data as { field: string; operator: string }
    assert.strictEqual(cond.field, "identifiers")
    assert.strictEqual(cond.operator, "isNotEmpty")
  })

  it("accepts a count aggregate on a countable relation", () => {
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "creators",
        aggregate: "count",
        qualifier: "aut",
        operator: "greaterThan",
        value: 3,
      }).success,
    )
  })

  it("accepts a field-ref between (duration within a margin of another format)", () => {
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "duration",
        format: "readaloud",
        operator: "between",
        value: [
          { ref: { format: "audiobook" }, factor: 0.8 },
          { ref: { format: "audiobook" }, factor: 1.2 },
        ],
      }).success,
    )
  })

  it("accepts a relation overlap (author is also narrator)", () => {
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "creators",
        qualifier: "aut",
        operator: "intersects",
        value: { ref: { qualifier: "nrt" } },
      }).success,
    )
  })

  it("accepts a scheme-qualified identifier value match", () => {
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "identifiers",
        qualifier: "44444444-4444-4444-4444-444444444444",
        operator: "startsWith",
        value: "978",
      }).success,
    )
  })

  it("accepts a generic search condition", () => {
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "search",
        operator: "contains",
        value: "tolkien",
      }).success,
    )
  })

  it("tolerates a legacy unary condition that still carries an empty value", () => {
    assert.ok(
      shelfFilterConditionSchema.safeParse({
        type: "condition",
        field: "title",
        operator: "isEmpty",
        value: "",
      }).success,
    )
  })
})

describe("buildFilterExpression sql", () => {
  const userId = "11111111-1111-1111-1111-111111111111" as UUID
  const testDb = createKyselyDb(new Database(":memory:"))

  const compile = (node: ShelfFilterNode): string =>
    testDb
      .selectFrom("book")
      .selectAll()
      .where((eb) => buildFilterExpression(eb, node, userId))
      .compile().sql

  it("queries the review column for a review filter", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "review",
          operator: "contains",
          value: "x",
        },
      ],
    })
    assert.match(sql, /user_book_rating/)
    assert.match(sql, /review/)
  })

  it("uses json_extract for a qualified rating filter", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "userRating",
          qualifier: "plot",
          operator: "greaterOrEqual",
          value: 4,
        },
      ],
    })
    assert.match(sql, /json_extract/)
  })

  it("uses json_extract for a legacy ratingDimension filter (raw json path)", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "ratingDimension",
          dimension: "plot",
          operator: "greaterOrEqual",
          value: 4,
        } as unknown as ShelfFilterNode,
      ],
    })
    assert.match(sql, /json_extract/)
  })

  it("searches title, author and series for a search filter", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "search",
          operator: "contains",
          value: "x",
        },
      ],
    })
    assert.match(sql, /creator/)
    assert.match(sql, /series/)
  })

  it("compiles audiobook-only Format to audiobook present and ebook absent", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "format",
          operator: "isAnyOf",
          value: ["audiobook-only"],
        },
      ],
    })
    assert.match(sql, /exists.*from "audiobook"/s)
    assert.match(sql, /not exists.*from "ebook"/s)
  })

  it("compiles missing-readaloud Format to ebook+audiobook present and not aligned", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "format",
          operator: "isAnyOf",
          value: ["missing-readaloud"],
        },
      ],
    })
    assert.match(sql, /from "ebook"/)
    assert.match(sql, /from "audiobook"/)
    assert.match(sql, /not exists.*from "readaloud"/s)
  })

  it("scopes a qualified creators include to that relator role", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "creators",
          operator: "includes",
          value: ["33333333-3333-3333-3333-333333333333"],
          qualifier: "nrt",
        },
      ],
    })
    assert.match(sql, /from "book_to_creator"/)
    assert.match(sql, /"book_to_creator"\."role"/)
  })

  it("expands the authors alias to a role-scoped creators condition", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "authors",
          operator: "includes",
          value: ["33333333-3333-3333-3333-333333333333"],
        },
      ],
    })
    assert.match(sql, /from "book_to_creator"/)
    assert.match(sql, /"book_to_creator"\."role"/)
  })

  it("compiles a creator count condition to a count subquery", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "authors",
          aggregate: "count",
          operator: "greaterThan",
          value: 3,
        },
      ],
    })
    assert.match(sql, /count\(\*\)/)
    assert.match(sql, /book_to_creator/)
  })

  it("scopes an identifier value match to the qualifier's type", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "identifiers",
          qualifier: "44444444-4444-4444-4444-444444444444",
          operator: "startsWith",
          value: "978",
        },
      ],
    })
    assert.match(sql, /from "identifier"/)
    assert.match(sql, /identifier_type_uuid/)
    assert.match(sql, /"identifier"\."value"/)
  })

  it("compiles a field-ref between to scaled cross-format subqueries", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "duration",
          format: "readaloud",
          operator: "between",
          value: [
            { ref: { format: "audiobook" }, factor: 0.8 },
            { ref: { format: "audiobook" }, factor: 1.2 },
          ],
        },
      ],
    })
    assert.match(sql, /from readaloud /)
    assert.match(sql, /from audiobook /)
    assert.match(sql, /\*/)
  })

  it("compiles intersects to a same-person self-join across roles", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "creators",
          qualifier: "aut",
          operator: "intersects",
          value: { ref: { qualifier: "nrt" } },
        },
      ],
    })
    assert.match(sql, /"book_to_creator" as "a"/)
    assert.match(sql, /"book_to_creator" as "b"/)
    assert.match(sql, /"b"\."creator_uuid" = "a"\."creator_uuid"/)
  })

  it("compiles an identifiers presence test without joining book again", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "identifiers",
          operator: "isNotEmpty",
        },
      ],
    })
    assert.match(sql, /exists.*from "identifier"/s)
    assert.doesNotMatch(sql, /from "identifier".*join "book"/s)
  })

  it("leaves a creators include unscoped when no role is given", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "creators",
          operator: "includes",
          value: ["33333333-3333-3333-3333-333333333333"],
        },
      ],
    })
    assert.match(sql, /from "book_to_creator"/)
    assert.doesNotMatch(sql, /"book_to_creator"\."role"/)
  })

  it("scopes a qualified creators isEmpty to that relator role", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "creators",
          operator: "isEmpty",
          qualifier: "aut",
        },
      ],
    })
    assert.match(sql, /not exists.*from "book_to_creator"/s)
    assert.match(sql, /"book_to_creator"\."role"/)
  })

  it("compiles alignedAt between to a range on the book column", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "alignedAt",
          operator: "between",
          value: ["2024-01-01", "2024-12-31"],
        },
      ],
    })
    assert.match(sql, /"aligned_at"/)
  })

  it("compiles lastRead to a correlated subquery on position.updated_at", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "lastRead",
          operator: "after",
          value: "2024-01-01",
        },
      ],
    })
    assert.match(sql, /from "position"/)
    assert.match(sql, /"updated_at"/)
  })

  it("compiles readingPosition to a json_extract of total progression", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "readingPosition",
          operator: "between",
          value: [0.01, 0.99],
        },
      ],
    })
    assert.match(sql, /from "position"/)
    assert.match(sql, /json_extract/)
    assert.match(sql, /totalProgression/)
  })

  it("scopes a format-tagged fileSize to a single asset table", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "fileSize",
          operator: "greaterThan",
          value: 1000,
          format: "ebook",
        },
      ],
    })
    assert.match(sql, /from ebook /)
    assert.doesNotMatch(sql, /from audiobook /)
  })

  it("uses the cross-format fallback when fileSize has no format", () => {
    const sql = compile({
      type: "and",
      children: [
        {
          type: "condition",
          field: "fileSize",
          operator: "greaterThan",
          value: 1000,
        },
      ],
    })
    assert.match(sql, /from ebook /)
    assert.match(sql, /from audiobook /)
    assert.match(sql, /from readaloud /)
  })
})

describe("buildSortExpression sql", () => {
  const userId = "11111111-1111-1111-1111-111111111111" as UUID
  const seriesUuid = "22222222-2222-2222-2222-222222222222" as UUID
  const testDb = createKyselyDb(new Database(":memory:"))

  const orderSql = (
    field: SortField,
    ctx?: { userId?: UUID; seriesContext?: UUID },
  ): string =>
    testDb
      .selectFrom("book")
      .select("book.uuid")
      .orderBy(buildSortExpression(field, ctx), "desc")
      .compile().sql

  it("orders by a scalar book column directly", () => {
    const sql = orderSql("title")
    assert.match(sql, /order by/i)
    assert.match(sql, /book\.title/)
  })

  it("orders user rating via a user-scoped subquery", () => {
    const sql = orderSql("userRating", { userId })
    assert.match(sql, /user_book_rating/)
    assert.match(sql, /user_id/)
  })

  it("orders series position via a series-scoped subquery", () => {
    const sql = orderSql("seriesPosition", { seriesContext: seriesUuid })
    assert.match(sql, /book_to_series/)
    assert.match(sql, /position/)
  })

  it("coalesces asset tables for an asset-numeric sort", () => {
    const sql = orderSql("pageCount")
    assert.match(sql, /coalesce/i)
  })

  it("orders alignedAt by the book column", () => {
    const sql = orderSql("alignedAt")
    assert.match(sql, /aligned_at/)
  })

  it("orders lastRead via a user-scoped position subquery", () => {
    const sql = orderSql("lastRead", { userId })
    assert.match(sql, /from position/)
    assert.match(sql, /updated_at/)
  })
})

describe("SORTABLE_FIELDS / registry sync", () => {
  it("stays in sync with FIELD_REGISTRY sortable flags", () => {
    const registrySortable = Object.entries(FIELD_REGISTRY)
      .filter(([, def]) => def.sortable)
      .map(([field]) => field)
      .sort()
    assert.deepEqual([...SORTABLE_FIELDS].sort(), registrySortable)
  })
})

describe("field picker / registry coverage", () => {
  const PICKER_GROUPS = new Set([
    "text",
    "dates",
    "review",
    "relations",
    "creators",
    "media",
    "alignment",
  ])

  it("assigns every filterable field (except search) to a shown group", () => {
    for (const field of FIELDS) {
      if (field === "search") continue
      const { group } = getFieldDef(field)
      assert.ok(
        PICKER_GROUPS.has(group),
        `field "${field}" has group "${group}" not rendered by the picker`,
      )
    }
  })
})

describe("FORMAT_VALUES / compiler coverage", () => {
  const userId = "11111111-1111-1111-1111-111111111111" as UUID
  const testDb = createKyselyDb(new Database(":memory:"))

  const compile = (value: string): string =>
    testDb
      .selectFrom("book")
      .selectAll()
      .where((eb) =>
        buildFilterExpression(
          eb,
          {
            type: "and",
            children: [
              { type: "condition", field: "format", operator: "is", value },
            ],
          },
          userId,
        ),
      )
      .compile().sql

  for (const value of FORMAT_VALUES) {
    it(`compiles "${value}" to an asset-table predicate`, () => {
      const sql = compile(value)
      assert.match(sql, /ebook|audiobook|readaloud/)
    })
  }
})

describe("collectFilterIssues", () => {
  it("reports nothing for a valid nested filter", () => {
    const issues = collectFilterIssues({
      type: "and",
      children: [
        { type: "condition", field: "title", operator: "contains", value: "x" },
        {
          type: "not",
          child: {
            type: "or",
            children: [
              {
                type: "condition",
                field: "alignmentConfidence",
                operator: "greaterOrEqual",
                value: 90,
              },
            ],
          },
        },
      ],
    })
    assert.deepStrictEqual(issues, [])
  })

  it("reports a retired field with its replacement", () => {
    const issues = collectFilterIssues({
      type: "condition",
      field: "alignmentMissingSentences",
      operator: "greaterThan",
      value: 4,
    })
    assert.deepStrictEqual(issues, [
      {
        kind: "retiredField",
        field: "alignmentMissingSentences",
        replacedBy: "alignmentSentenceCoverage",
      },
    ])
  })

  it("dedupes by field and walks every block type", () => {
    const issues = collectFilterIssues({
      type: "and",
      children: [
        {
          type: "condition",
          field: "alignmentScore",
          operator: "is",
          value: 1,
        },
        {
          type: "not",
          child: {
            type: "condition",
            field: "alignmentScore",
            operator: "is",
            value: 2,
          },
        },
        { type: "condition", field: "nope", operator: "is", value: 2 },
      ],
    })
    assert.deepStrictEqual(
      issues.map((issue) => issue.kind),
      ["retiredField", "unknownField"],
    )
  })

  it("reports a condition that no longer validates on a live field", () => {
    const issues = collectFilterIssues({
      type: "condition",
      field: "alignmentGrade",
      operator: "greaterThan",
      value: "A",
    })
    assert.strictEqual(issues.length, 1)
    const [issue] = issues
    assert.ok(issue && issue.kind === "invalidCondition")
    assert.strictEqual(issue.field, "alignmentGrade")
  })

  it("still accepts legacy field spellings", () => {
    const issues = collectFilterIssues({
      type: "condition",
      field: "rating",
      operator: "greaterOrEqual",
      value: 4,
    })
    assert.deepStrictEqual(issues, [])
  })
})

describe("buildFilterExpression / unknown fields", () => {
  const userId = "11111111-1111-1111-1111-111111111111" as UUID
  const testDb = createKyselyDb(new Database(":memory:"))

  it("throws instead of matching every book", () => {
    assert.throws(
      () =>
        testDb
          .selectFrom("book")
          .selectAll()
          .where((eb) =>
            buildFilterExpression(
              eb,
              {
                type: "condition",
                field: "alignmentMutedChapters" as ShelfFilterField,
                operator: "lessThan",
                value: 2,
              },
              userId,
            ),
          )
          .compile(),
      (error: unknown) =>
        error instanceof ShelfFilterInvalidError &&
        error.issues.some((issue) => issue.kind === "retiredField"),
    )
  })
})

describe("makeBookComparator", () => {
  const seriesUuid = "22222222-2222-2222-2222-222222222222" as UUID

  const bookWithPosition = (
    uuid: string,
    position: number | null,
  ): BookWithRelations =>
    ({
      uuid,
      series: [{ uuid: seriesUuid, position }],
    }) as unknown as BookWithRelations

  it("orders by series position within a series context", () => {
    const first = bookWithPosition("a", 1)
    const second = bookWithPosition("b", 2)
    const cmp = makeBookComparator("seriesPosition", "asc", {
      seriesUuid,
    })
    assert.ok(cmp(first, second) < 0)
    assert.ok(cmp(second, first) > 0)
  })

  it("sorts books with no position last regardless of direction", () => {
    const withPos = bookWithPosition("a", 3)
    const without = bookWithPosition("b", null)
    const asc = makeBookComparator("seriesPosition", "asc", { seriesUuid })
    const desc = makeBookComparator("seriesPosition", "desc", { seriesUuid })
    assert.ok(asc(withPos, without) < 0)
    assert.ok(desc(withPos, without) < 0)
  })
})

describe("displaySeriesOf", () => {
  const featuredUuid = "33333333-3333-3333-3333-333333333333" as UUID
  const viewedUuid = "44444444-4444-4444-4444-444444444444" as UUID

  const bookWithSeries = (
    series: { uuid: UUID; position: number | null; featured: boolean }[],
  ): BookWithRelations =>
    ({ uuid: "a", series }) as unknown as BookWithRelations

  it("uses the viewed series over a different featured series", () => {
    const book = bookWithSeries([
      { uuid: featuredUuid, position: null, featured: true },
      { uuid: viewedUuid, position: 1, featured: false },
    ])
    const series = displaySeriesOf(book, { seriesUuid: viewedUuid })
    assert.strictEqual(series?.uuid, viewedUuid)
    assert.strictEqual(series.position, 1)
  })

  it("does not fall back to another series when the viewed series has no position", () => {
    const book = bookWithSeries([
      { uuid: featuredUuid, position: 5, featured: true },
      { uuid: viewedUuid, position: null, featured: false },
    ])
    const series = displaySeriesOf(book, { seriesUuid: viewedUuid })
    assert.strictEqual(series?.uuid, viewedUuid)
    assert.strictEqual(series.position, null)
  })

  it("uses the featured series outside of a series context", () => {
    const book = bookWithSeries([
      { uuid: viewedUuid, position: 1, featured: false },
      { uuid: featuredUuid, position: 2, featured: true },
    ])
    assert.strictEqual(displaySeriesOf(book, undefined)?.uuid, featuredUuid)
    assert.strictEqual(
      displaySeriesOf(book, { seriesUuid: null })?.uuid,
      featuredUuid,
    )
  })

  it("falls back to the first series when none is featured", () => {
    const book = bookWithSeries([
      { uuid: viewedUuid, position: 1, featured: false },
      { uuid: featuredUuid, position: 2, featured: false },
    ])
    assert.strictEqual(displaySeriesOf(book, undefined)?.uuid, viewedUuid)
  })

  it("returns undefined for a book with no series", () => {
    assert.strictEqual(
      displaySeriesOf(bookWithSeries([]), undefined),
      undefined,
    )
  })
})
