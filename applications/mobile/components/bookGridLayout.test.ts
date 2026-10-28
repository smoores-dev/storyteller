import assert from "node:assert/strict"

import { test } from "vitest"

import { calculateBookGridLayout } from "./bookGridLayout"

const thumbnailHorizontalMargin = 12
const gridContainerPadding = 24

const rowFitsWithin = (availableWidth: number) => {
  const { numColumns, thumbnailWidth } = calculateBookGridLayout(availableWidth)

  return (
    numColumns * (thumbnailWidth + thumbnailHorizontalMargin) +
      gridContainerPadding <=
    availableWidth
  )
}

test("keeps two columns on a phone without horizontal insets", () => {
  assert.equal(calculateBookGridLayout(390).numColumns, 2)
})

test("drops a column for the 84pt rail and keeps the row inside the rest", () => {
  const withoutRail = calculateBookGridLayout(1000)
  const withRail = calculateBookGridLayout(1000 - 84)

  assert.equal(withoutRail.numColumns, 6)
  assert.equal(withRail.numColumns, 5)
  assert.ok(rowFitsWithin(1000 - 84))
})

test("always returns whole columns that fit the width left by the safe area", () => {
  for (let width = 150; width <= 1400; width += 1) {
    const { numColumns, thumbnailWidth } = calculateBookGridLayout(width)

    assert.ok(
      numColumns >= 1 && thumbnailWidth > 0 && rowFitsWithin(width),
      `width ${width} laid out ${numColumns} columns of ${thumbnailWidth}`,
    )
  }
})
