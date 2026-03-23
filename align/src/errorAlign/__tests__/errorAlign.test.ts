import assert from "node:assert"
import { describe, test } from "node:test"

import { computeLevenshteinDistanceMatrix } from "../editDistance.ts"
import { errorAlign } from "../errorAlign.ts"
import { categorizeChar } from "../utils.ts"

void describe("errorAlign", () => {
  void test("error alignment for an example including all substitution types", () => {
    const ref = "This is a substitution test deleted."
    const hyp = "Inserted this is a contribution test."

    const alignments = errorAlign(ref, hyp)
    assert.deepStrictEqual(
      alignments.map((a) => a.opType),
      ["INSERT", "MATCH", "MATCH", "MATCH", "SUBSTITUTE", "MATCH", "DELETE"],
    )
  })

  void test("error alignment for full match", () => {
    const ref = "This is a test."
    const hyp = "This is a test."

    const alignments = errorAlign(ref, hyp)

    assert.deepStrictEqual(
      alignments.map((a) => a.opType),
      ["MATCH", "MATCH", "MATCH", "MATCH"],
    )
  })

  void test("error alignment for partial substitutions and insertions with compound markers", () => {
    const ref = "test"
    const hyp = "testpartial"

    const alignments = errorAlign(ref, hyp)

    assert.strictEqual(alignments.length, 2)
    assert.strictEqual(alignments[0]?.opType, "SUBSTITUTE")
    assert.strictEqual(alignments[0].leftCompound, false)
    assert.strictEqual(alignments[0].rightCompound, true)
    assert.strictEqual(alignments[1]?.opType, "INSERT")
    assert.strictEqual(alignments[1].leftCompound, true)
    assert.strictEqual(alignments[1].rightCompound, false)
  })
})

void test("character categorization", () => {
  assert.strictEqual(categorizeChar("<"), 0)
  assert.strictEqual(categorizeChar("b"), 1)
  assert.strictEqual(categorizeChar("a"), 2)
  assert.strictEqual(categorizeChar("'"), 3)
})

void test("string representation of alignment objects", () => {
  const deleteAlignment = errorAlign("deleted", "")[0]
  assert.strictEqual(
    deleteAlignment?.toString(),
    'Alignment(DELETE: "deleted")',
  )

  const insertAlignment = errorAlign("", "inserted")[0]
  assert.strictEqual(
    insertAlignment?.toString(),
    'Alignment(INSERT: "inserted")',
  )

  const substituteAlignment = errorAlign(
    "substitution",
    "substitutiontesting",
  )[0]
  assert.strictEqual(substituteAlignment?.leftCompound, false)
  assert.strictEqual(substituteAlignment.rightCompound, true)
  assert.strictEqual(
    substituteAlignment.toString(),
    'Alignment(SUBSTITUTE: "substitution"- -> "substitution")',
  )

  const matchAlignment = errorAlign("test", "test")[0]
  assert.strictEqual(
    matchAlignment?.toString(),
    'Alignment(MATCH: "test" == "test")',
  )
})

void test("Levenshtein distance matrix computation", () => {
  const ref = "kitten"
  const hyp = "sitting"

  const distanceMatrix = computeLevenshteinDistanceMatrix(ref, hyp)

  assert.strictEqual(distanceMatrix.at(-1)!.at(-1), 3)
})
