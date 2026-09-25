export class TextDirective {
  public prefix: string | undefined
  public textStart: string
  public textEnd: string | undefined
  public suffix: string | undefined

  constructor(directiveValue: string) {
    const [, prefix, textStart, textEnd, suffix] =
      directiveValue.match(
        /^(?:([^-,]*)-,)?([^-,]*)(?:,([^-,]+))?(?:,-([^-,]*))?$/,
      ) ?? []

    if (!textStart) {
      throw new Error(
        `Could not parse "${directiveValue}" as a text fragment. Failed to find required part textStart.`,
      )
    }

    if (prefix === "") {
      throw new Error(
        `Could not parse "${directiveValue}" as a text fragment. Prefix must be non-empty if provided.`,
      )
    }

    if (suffix === "") {
      throw new Error(
        `Could not parse "${directiveValue}" as a text fragment. Suffix must be non-empty if provided.`,
      )
    }

    if (prefix) {
      try {
        decodeURIComponent(prefix)
      } catch {
        throw new Error(`Could not URI decode prefix "${prefix}"`)
      }
    }

    if (textStart) {
      try {
        decodeURIComponent(textStart)
      } catch {
        throw new Error(`Could not URI decode textStart "${textStart}"`)
      }
    }

    if (textEnd) {
      try {
        decodeURIComponent(textEnd)
      } catch {
        throw new Error(`Could not URI decode textEnd "${textEnd}"`)
      }
    }

    if (suffix) {
      try {
        decodeURIComponent(suffix)
      } catch {
        throw new Error(`Could not URI decode suffix "${suffix}"`)
      }
    }

    this.prefix = prefix
    this.textStart = textStart
    this.textEnd = textEnd
    this.suffix = suffix
  }

  get decodedPrefix() {
    return this.prefix ? decodeURIComponent(this.prefix) : this.prefix
  }

  get decodedTextStart() {
    return decodeURIComponent(this.textStart)
  }

  get decodedTextEnd() {
    return this.textEnd ? decodeURIComponent(this.textEnd) : this.textEnd
  }

  get decodedSuffix() {
    return this.suffix ? decodeURIComponent(this.suffix) : this.suffix
  }

  toString() {
    const prefix = this.prefix ? `${this.prefix}-,` : ""
    const textEnd = this.textEnd ? `,${this.textEnd}` : ""
    const suffix = this.suffix ? `,-${this.suffix}` : ""
    return `text=${prefix}${this.textStart}${textEnd}${suffix}`
  }
}
