export class CharacterRange {
  public offset: number
  public end?: number | undefined

  constructor(value?: string) {
    if (value === undefined) {
      this.offset = 0
      return
    }

    const [offsetString, endString] = value.split(",")
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const offset = parseInt(offsetString!, 10)
    if (
      !/^(?:0|[1-9][0-9]*)$/.test(offsetString ?? "") ||
      offset.toString() !== offsetString
    ) {
      throw new Error(
        `Failed to parse identifier "char=${value}". "char" fragment value must be a single integer, or two integers joined with a ",".`,
      )
    }
    const end = endString === undefined ? undefined : parseInt(endString, 10)
    if (
      end !== undefined &&
      (!/^(?:0|[1-9][0-9]*)$/.test(endString ?? "") ||
        end.toString() !== endString)
    ) {
      throw new Error(
        `Failed to parse identifier "char=${value}". "char" fragment value must be a single integer, or two integers joined with a ",".`,
      )
    }

    if (end !== undefined && end <= offset) {
      throw new Error(
        `Character range end (${end}) must be greater than start (${offset})`,
      )
    }

    this.offset = offset
    this.end = end
  }

  toString() {
    const end = this.end === undefined ? "" : `,${this.end}`
    return `char=${this.offset}${end}`
  }
}
