import { describe, expect, it } from "vitest"

import { MediaTemporalDimension } from "../media/mediaTemporal.ts"

describe("MediaTemporalDimension", () => {
  it("should parse an npt dimension", () => {
    const dimension = new MediaTemporalDimension("npt:5")

    expect(dimension.format).toBe("npt")
    expect(dimension.timeStart).toBe("5")
    expect(dimension.parsedTimeStart).toBe(5)
  })

  it("should parse a format-less dimension", () => {
    const dimension = new MediaTemporalDimension("5")

    expect(dimension.format).toBe("npt")
    expect(dimension.timeStart).toBe("5")
    expect(dimension.parsedTimeStart).toBe(5)
  })

  it("should parse a dimension with an end", () => {
    const dimension = new MediaTemporalDimension("5,6")

    expect(dimension.format).toBe("npt")
    expect(dimension.timeStart).toBe("5")
    expect(dimension.timeEnd).toBe("6")
    expect(dimension.parsedTimeStart).toBe(5)
    expect(dimension.parsedTimeEnd).toBe(6)
  })

  it("should parse a dimension with an hh:mm:ss start", () => {
    const dimension = new MediaTemporalDimension("00:01:05,66")

    expect(dimension.format).toBe("npt")
    expect(dimension.timeStart).toBe("00:01:05")
    expect(dimension.timeEnd).toBe("66")
    expect(dimension.parsedTimeStart).toBe(65)
    expect(dimension.parsedTimeEnd).toBe(66)
  })

  it("should throw if start is greater than end", () => {
    expect(() => new MediaTemporalDimension("00:01:05,6")).toThrow()
  })

  it("should parse a dimension with an hh:mm:ss end", () => {
    const dimension = new MediaTemporalDimension("5,00:01:06")

    expect(dimension.format).toBe("npt")
    expect(dimension.timeStart).toBe("5")
    expect(dimension.timeEnd).toBe("00:01:06")
    expect(dimension.parsedTimeStart).toBe(5)
    expect(dimension.parsedTimeEnd).toBe(66)
  })

  it("should parse an all hh:mm:ss dimension", () => {
    const dimension = new MediaTemporalDimension("00:01:05,00:01:06")

    expect(dimension.format).toBe("npt")
    expect(dimension.timeStart).toBe("00:01:05")
    expect(dimension.timeEnd).toBe("00:01:06")
    expect(dimension.parsedTimeStart).toBe(65)
    expect(dimension.parsedTimeEnd).toBe(66)
  })
})
