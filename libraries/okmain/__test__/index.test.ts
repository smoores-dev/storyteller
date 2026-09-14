import assert from "node:assert"
import { readFile } from "node:fs/promises"

import chalk, { supportsColor } from "chalk"
import { expect, test } from "vitest"

import { colors, colorsDetailed, InputImage } from "../index.js"

test("extracts colors from raw RGB buffer", () => {
  const buf = Buffer.from([255, 0, 0, 0, 255, 0, 255, 0, 0, 255, 0, 0])

  const result = colors(new InputImage(buf, 2, 2))

  assert.ok(result.length > 0, "should have at least one color")
  assert.ok(result[0]!.r > 150, "should be red")
})

test("extracts colors from a JPEG file", async () => {
  const fixture = await readFile(
    new URL(
      "../../audiobook/src/__fixtures__/sleepy_hollow.jpg",
      import.meta.url,
    ),
  )

  const img = InputImage.fromImage(fixture)
  const result = colors(img)

  if (supportsColor) {
    const outputColors = result
      .map((c) => `${chalk.bgRgb(c.r, c.g, c.b)("   ")}`)
      .join(" ")
    console.log("Output")
    console.log(outputColors)
  }

  expect(result).toMatchSnapshot()
})

test("extracts colors from a JPEG file w more info", async () => {
  const fixture = await readFile(
    new URL(
      "../../audiobook/src/__fixtures__/sleepy_hollow.jpg",
      import.meta.url,
    ),
  )

  const img = InputImage.fromImage(fixture)
  const result = colorsDetailed(img)

  if (supportsColor) {
    const outputColors = result
      .map(
        (c) =>
          `${chalk.bgRgb(c.r, c.g, c.b)("   ")} ${(c.fraction * 100).toFixed(2)}% ${c.chroma.toFixed(2)}C ${c.score.toFixed(2)} score`,
      )
      .join("\n")
    console.log("Output")
    console.log(outputColors)
  }

  expect(result).toMatchSnapshot()
})
