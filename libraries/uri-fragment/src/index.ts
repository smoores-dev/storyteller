import { CharacterRange } from "./char.ts"
import { MediaDimensions } from "./media/mediaDimensions.ts"
import { TextDirective } from "./text.ts"

export { CharacterRange, MediaDimensions, TextDirective }
export { MediaTemporalDimension } from "./media/mediaTemporal.ts"
export { MediaSpatialDimension } from "./media/mediaSpatial.ts"

export type FragmentIdentifier =
  | { kind: "media"; media: MediaDimensions }
  | { kind: "epubcfi"; path: string }
  | { kind: "xpointer"; expression: string }
  | { kind: "crengine"; path: string }
  | { kind: "anchor"; value: string }
  | { kind: "char"; range: CharacterRange }

export type FragmentIdentifierKind = FragmentIdentifier["kind"]

type FragmentIdentifierFor<Kind extends FragmentIdentifierKind> = Omit<
  Extract<FragmentIdentifier, { kind: Kind }>,
  "kind"
>

export class FragmentDirective {
  public text: TextDirective[] = []
  public unknown: string[] = []

  appendTextDirective(directive: string | TextDirective) {
    this.text.push(
      typeof directive === "string" ? new TextDirective(directive) : directive,
    )
  }

  appendUnknownDirective(directive: string) {
    this.unknown.push(directive)
  }

  get empty(): boolean {
    return this.text.length === 0 && this.unknown.length === 0
  }

  toString() {
    if (this.empty) return ""

    const parts: string[] = []

    if (this.text.length) {
      parts.push(this.text.map((t) => t.toString()).join("&"))
    }

    if (this.unknown.length) {
      parts.push(this.unknown.join("&"))
    }

    return ":~:" + parts.join("&")
  }
}

export class UriFragment {
  public identifier?: FragmentIdentifier
  public directive = new FragmentDirective()

  constructor(input?: string) {
    if (input === undefined) return
    const fragment = input.startsWith("#") ? input.slice(1) : input

    const directivePrefix = fragment.indexOf(":~:")
    const [identifier, directive] =
      directivePrefix >= 0
        ? [
            fragment.slice(0, directivePrefix),
            fragment.slice(directivePrefix + 3),
          ]
        : [fragment]

    this.identifier = this.parseIdentifier(identifier)
    this.directive = this.parseDirective(directive)
  }

  private parseDirective(directive?: string): FragmentDirective {
    const fragmentDirective = new FragmentDirective()
    if (!directive) return fragmentDirective

    const entries = directive.split("&")
    const pairs = entries.map<[string, string]>((entry) => {
      const equals = entry.indexOf("=")
      return equals >= 0
        ? [entry.slice(0, equals), entry.slice(equals + 1)]
        : ["", entry]
    })

    for (const [key, value] of pairs) {
      if (key === "text") {
        fragmentDirective.appendTextDirective(value)
      } else {
        fragmentDirective.appendUnknownDirective(
          key ? `${key}=${value}` : value,
        )
      }
    }

    return fragmentDirective
  }

  private parseIdentifier(identifier?: string): FragmentIdentifier | undefined {
    if (!identifier) return undefined

    if (identifier.startsWith("epubcfi(")) {
      if (!identifier.endsWith(")")) {
        return {
          kind: "anchor",
          value: identifier,
        }
      }
      return {
        kind: "epubcfi",
        path: identifier.slice("epubcfi(".length, -1),
      }
    }

    if (identifier.startsWith("xpointer(")) {
      if (!identifier.endsWith(")")) {
        return {
          kind: "anchor",
          value: identifier,
        }
      }
      return {
        kind: "xpointer",
        expression: identifier.slice("xpointer(".length, -1),
      }
    }

    if (identifier.startsWith("crengine(")) {
      if (!identifier.endsWith(")")) {
        return {
          kind: "anchor",
          value: identifier,
        }
      }
      return {
        kind: "crengine",
        path: identifier.slice("crengine(".length, -1),
      }
    }

    if (identifier.includes("=")) {
      const entries = identifier.split("&")
      const pairs = entries.map<[string, string]>((entry) => {
        const equals = entry.indexOf("=")
        return equals >= 0
          ? [entry.slice(0, equals), entry.slice(equals + 1)]
          : ["", entry]
      })

      const charPair = pairs.find(([key]) => key === "char")
      if (charPair) {
        if (pairs.length > 1) {
          throw new Error(
            `Failed to parse identifier "${identifier}". "char" fragment cannot be paired with other fragment identifier types.`,
          )
        }

        return {
          kind: "char",
          range: new CharacterRange(charPair[1]),
        }
      }

      return {
        kind: "media",
        media: new MediaDimensions(pairs),
      }
    }

    return {
      kind: "anchor",
      value: identifier,
    }
  }

  setIdentifier<Kind extends FragmentIdentifierKind>(
    kind: Kind,
    identifier: FragmentIdentifierFor<Kind>,
  ) {
    this.identifier = { kind, ...identifier } as unknown as FragmentIdentifier
  }

  identifierString(): string {
    const identifier = this.identifier
    if (!identifier) return ""

    switch (identifier.kind) {
      case "anchor": {
        return identifier.value
      }
      case "char": {
        return identifier.range.toString()
      }
      case "epubcfi": {
        return `epubcfi(${identifier.path})`
      }
      case "xpointer": {
        return `xpointer(${identifier.expression})`
      }
      case "crengine": {
        return `crengine(${identifier.path})`
      }
      case "media": {
        return identifier.media.toString()
      }
    }
  }

  toString(): string {
    return `#${this.identifierString()}${this.directive.toString()}`
  }
}
