import assert from "node:assert"
import { describe, test } from "node:test"

import { errorAlignBeamSearch as tsBeamSearch } from "../beamSearch.ts"
import {
  computeErrorAlignDistanceMatrix as tsErrorAlign,
  computeLevenshteinDistanceMatrix as tsLevenshtein,
} from "../editDistance.ts"
import { SubgraphMetadata } from "../graphMetadata.ts"
import {
  computeErrorAlignDistanceMatrix as nativeErrorAlign,
  computeLevenshteinDistanceMatrix as nativeLevenshtein,
  errorAlignBeamSearch as nativeBeamSearch,
} from "../native.ts"
import { getAlignments } from "../pathToAlignment.ts"
import {
  basicNormalizer,
  basicTokenizer,
  ensureLengthPreservation,
  unpackRegexMatch,
} from "../utils.ts"

void describe("native C++ vs TypeScript implementations", () => {
  void describe("Levenshtein distance matrix", () => {
    void test("string input", () => {
      const ref = "kitten"
      const hyp = "sitting"

      const tsResult = tsLevenshtein(ref, hyp)
      const nativeResult = nativeLevenshtein(ref, hyp)

      assert.deepStrictEqual(nativeResult, tsResult)
    })

    void test("string array input", () => {
      const ref = ["hello", "world"]
      const hyp = ["hello", "there"]

      const tsResult = tsLevenshtein(ref, hyp)
      const nativeResult = nativeLevenshtein(ref, hyp)

      assert.deepStrictEqual(nativeResult, tsResult)
    })

    void test("with backtrace", () => {
      const ref = "kitten"
      const hyp = "sitting"

      const tsResult = tsLevenshtein(ref, hyp, true)
      const nativeResult = nativeLevenshtein(ref, hyp, true)

      assert.deepStrictEqual(nativeResult, tsResult)
    })
  })

  void describe("error align distance matrix", () => {
    void test("string input", () => {
      const ref = "test"
      const hyp = "best"

      const tsResult = tsErrorAlign(ref, hyp)
      const nativeResult = nativeErrorAlign(ref, hyp)

      assert.deepStrictEqual(nativeResult, tsResult)
    })

    void test("with backtrace", () => {
      const ref = "test"
      const hyp = "best"

      const tsResult = tsErrorAlign(ref, hyp, true)
      const nativeResult = nativeErrorAlign(ref, hyp, true)

      assert.deepStrictEqual(nativeResult, tsResult)
    })
  })

  void describe("beam search", () => {
    function buildSubgraphMetadata(ref: string, hyp: string) {
      const tokenizer = basicTokenizer
      const normalizer = basicNormalizer
      const unpackedTokenizer = unpackRegexMatch(tokenizer)
      const ensuredNormalizer = ensureLengthPreservation(normalizer)
      const refTokenMatches = unpackedTokenizer(ref)
      const hypTokenMatches = unpackedTokenizer(hyp)
      const refNorm = refTokenMatches.map(([r]) => ensuredNormalizer(r))
      const hypNorm = hypTokenMatches.map(([h]) => ensuredNormalizer(h))
      return new SubgraphMetadata(
        ref,
        hyp,
        refTokenMatches,
        hypTokenMatches,
        refNorm,
        hypNorm,
      )
    }

    void test("simple substitution", () => {
      const src = buildSubgraphMetadata("hello", "jello")

      const tsPath = tsBeamSearch(src)
      const nativePath = nativeBeamSearch(src)

      const tsAlignments = getAlignments(tsPath)
      const nativeAlignments = getAlignments(nativePath)

      assert.deepStrictEqual(nativeAlignments, tsAlignments)
    })

    void test("multi-word alignment with all op types", () => {
      const ref = "This is a substitution test deleted."
      const hyp = "Inserted this is a contribution test."

      const src = buildSubgraphMetadata(ref, hyp)

      const tsPath = tsBeamSearch(src)
      const nativePath = nativeBeamSearch(src)

      const tsAlignments = getAlignments(tsPath)
      const nativeAlignments = getAlignments(nativePath)

      assert.deepStrictEqual(nativeAlignments, tsAlignments)
    })

    void test("identical strings", () => {
      const src = buildSubgraphMetadata("test words", "test words")

      const tsPath = tsBeamSearch(src)
      const nativePath = nativeBeamSearch(src)

      const tsAlignments = getAlignments(tsPath)
      const nativeAlignments = getAlignments(nativePath)

      assert.deepStrictEqual(nativeAlignments, tsAlignments)
    })
  })
})
