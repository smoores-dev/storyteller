export class MediaTemporalDimension {
  public format: "npt"
  public timeStart: string
  public timeEnd?: string | undefined

  constructor(dimensionValue?: string) {
    if (dimensionValue === undefined) {
      this.format = "npt"
      this.timeStart = "0"
      return
    }

    const timePattern =
      "(?:[0-9]+(?:\\.[0-9]*)?|[0-9]+:[0-5][0-9]:[0-5][0-9](?:\\.[0-9]*)?|[0-5][0-9]:[0-5][0-9](?:\\.[0-9]*)?)"
    const fragmentPattern = `^(?:([a-z]+):)?(${timePattern})?(?:,(${timePattern}))?$`
    const [, format, timeStart, timeEnd] =
      dimensionValue.match(new RegExp(fragmentPattern)) ?? []

    if (format !== undefined && format !== "npt") {
      throw new Error(
        `Could not parse "${dimensionValue}" as a media temporal fragment. ${format} is not a supported syntax format, the only supported format is "npt".`,
      )
    }

    if (!timeStart) {
      throw new Error(
        `Could not parse "${dimensionValue}" as a media temporal fragment. Failed to parse time start.`,
      )
    }

    this.format = format ?? "npt"
    this.timeStart = timeStart
    this.timeEnd = timeEnd

    if (
      this.parsedTimeEnd !== undefined &&
      this.parsedTimeStart >= this.parsedTimeEnd
    ) {
      throw new Error(
        `${this.timeStart}, parsed as ${this.parsedTimeStart}, must be strictly less than ${this.timeEnd}, parsed as ${this.parsedTimeEnd}`,
      )
    }
  }

  get parsedTimeStart(): number {
    return parseTime(this.timeStart)
  }

  get parsedTimeEnd(): number | undefined {
    if (this.timeEnd === undefined) return undefined

    return parseTime(this.timeEnd)
  }

  toString() {
    const timeEnd = this.timeEnd ? `,${this.timeEnd}` : ""
    return `${this.timeStart}${timeEnd}`
  }
}

function parseTime(input: string): number {
  const segments = input.split(":")
  if (segments.length === 1) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    return parseFloat(segments[0]!)
  }

  if (segments.length === 2) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    return parseInt(segments[0]!) * 60 + parseFloat(segments[1]!)
  }

  return (
    // oxlint-disable-next-line typescript/no-non-null-assertion
    parseInt(segments[0]!) * 3600 +
    // oxlint-disable-next-line typescript/no-non-null-assertion
    parseInt(segments[1]!) * 60 +
    // oxlint-disable-next-line typescript/no-non-null-assertion
    parseFloat(segments[2]!)
  )
}
