export class MediaSpatialDimension {
  public unit: "pixel" | "percent"
  public xCoord: number
  public yCoord: number
  public width: number
  public height: number

  constructor(dimensionValue?: string) {
    if (dimensionValue === undefined) {
      this.unit = "pixel"
      this.xCoord = 0
      this.yCoord = 0
      this.width = 1
      this.height = 1
      return
    }
    const [, unit, xCoord, yCoord, width, height] =
      dimensionValue.match(
        /^(?:([a-z]+):)?([0-9]+),([0-9]+),([0-9]+),([0-9]+)$/,
      ) ?? []

    if (unit !== undefined && unit !== "pixel" && unit !== "percent") {
      throw new Error(
        `Could not parse "${dimensionValue}" as a media spatial fragment. ${unit} is not a supported unit, supported units are "pixel" and "percent".`,
      )
    }

    if (!xCoord) {
      throw new Error(
        `Could not parse "${dimensionValue}" as a media spatial fragment. Failed to parse x coordinate.`,
      )
    }

    if (!yCoord) {
      throw new Error(
        `Could not parse "${dimensionValue}" as a media spatial fragment. Failed to parse y coordinate.`,
      )
    }

    if (!width) {
      throw new Error(
        `Could not parse "${dimensionValue}" as a media spatial fragment. Failed to parse width.`,
      )
    }

    if (!height) {
      throw new Error(
        `Could not parse "${dimensionValue}" as a media spatial fragment. Failed to parse height.`,
      )
    }

    this.unit = unit ?? "pixel"
    this.xCoord = parseFloat(xCoord)
    this.yCoord = parseFloat(yCoord)
    this.width = parseFloat(width)
    this.height = parseFloat(height)

    if (this.width <= 0 || this.height <= 0) {
      throw new Error(
        `Width and height must both be strictly greater than zero. Received width=${this.width} and height=${this.height}`,
      )
    }

    if (this.unit === "percent") {
      if (this.xCoord + this.width > 100 || this.xCoord < 0) {
        throw new Error(`x + width must be between 0 and 100 (inclusive)`)
      }

      if (this.yCoord + this.height > 100 || this.yCoord < 0) {
        throw new Error(`y + height must be between 0 and 100 (inclusive)`)
      }
    }
  }

  toString() {
    return `${this.unit}:${this.xCoord},${this.yCoord},${this.width},${this.height}`
  }
}
