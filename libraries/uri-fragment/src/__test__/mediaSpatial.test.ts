import { describe, expect, it } from "vitest"

import { MediaSpatialDimension } from "../media/mediaSpatial.ts"

describe("MediaSpatialDimension", () => {
  it("should parse a unit-less fragment", () => {
    const fragment = new MediaSpatialDimension("160,120,320,240")

    expect(fragment.unit).toBe("pixel")
    expect(fragment.xCoord).toBe(160)
    expect(fragment.yCoord).toBe(120)
    expect(fragment.width).toBe(320)
    expect(fragment.height).toBe(240)
  })

  it("should parse a pixel fragment", () => {
    const fragment = new MediaSpatialDimension("pixel:160,120,320,240")

    expect(fragment.unit).toBe("pixel")
    expect(fragment.xCoord).toBe(160)
    expect(fragment.yCoord).toBe(120)
    expect(fragment.width).toBe(320)
    expect(fragment.height).toBe(240)
  })

  it("should parse a percent fragment", () => {
    const fragment = new MediaSpatialDimension("percent:25,25,50,50")

    expect(fragment.unit).toBe("percent")
    expect(fragment.xCoord).toBe(25)
    expect(fragment.yCoord).toBe(25)
    expect(fragment.width).toBe(50)
    expect(fragment.height).toBe(50)
  })

  it("should throw on unsupported units", () => {
    expect(() => new MediaSpatialDimension("inch:1,2,3,4")).toThrow()
  })

  it("should throw on missing dimensions", () => {
    expect(() => new MediaSpatialDimension("1,2,3")).toThrow()
  })
})
