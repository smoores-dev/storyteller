import assert from "node:assert"
import { describe, it } from "node:test"

import { slugify } from "../slugify.ts"

void describe("slugify", () => {
  void it("should slugify numbers", async () => {
    const input = "There were 10 cars."
    const output = "there-were-ten-cars"
    const { result } = await slugify(input, new Intl.Locale("en"))
    assert.strictEqual(result, output)
  })

  void it("should slugify numbers with decimals", async () => {
    const input = "It was 74.6 degrees out."
    const output = "it-was-seventy-four-point-six-degrees-out"
    const { result } = await slugify(input, new Intl.Locale("en"))
    assert.strictEqual(result, output)
  })

  void it("should slugify numbers with groupings", async () => {
    const input = "It weighed over 1,000 pounds"
    const output = "it-weighed-over-one-thousand-pounds"
    const { result } = await slugify(input, new Intl.Locale("en"))
    assert.strictEqual(result, output)
  })

  void it("should slugify currency", async () => {
    const input = "It costs $5,500.50."
    const output = "it-costs-five-thousand-five-hundred-dollars-and-fifty-cents"
    const { result } = await slugify(input, new Intl.Locale("en"))
    assert.strictEqual(result, output)
  })

  void it("should slugify German currency", async () => {
    const input = "Es kostet 5.500,50 €"
    const output = "es-kostet-funf-tausend-funf-hundert-euro-und-funfzig-cent"
    const { result } = await slugify(input, new Intl.Locale("de"))
    assert.strictEqual(result, output)
  })

  void it("should slugify Chinese currency", async () => {
    const input = "价格为 ¥5,500.50"
    const output = "jie-ge-wei-wu-qian-wu-bai-yuan-wu-shi-fen"
    const { result } = await slugify(input, new Intl.Locale("zh"))
    assert.strictEqual(result, output)
  })
})
