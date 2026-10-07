/**
 * The text crengine stores for a text node, and the map between its offsets and ours.
 *
 * crengine does not store source text verbatim. Unless the text is parsed as pre,
 * `PreProcessXmlString()` (lvxml.cpp:5904) rewrites every token: `\r`, `\n` and `\t` become a
 * space, and a run of spaces collapses to one. Nothing is trimmed — the trimming pass
 * (`TrimDoubleSpaces`) is only reached by the plain-text loaders, which set `TXTFLG_TRIM`.
 * Inside pre the text is kept as it is, except that tabs expand to 8-column stops
 * (`ExpandTabs`, lvxml.cpp:5638).
 *
 * A caret in a crengine xpointer counts characters of *that* text, and counts code points:
 * `lString32` is UTF-32, so an emoji is one character there and two here. Both differences
 * live here — {@link crengineText} returns the rewritten text plus conversions between a
 * crengine caret and an index into the string the caller holds.
 */
export type CrengineText = {
  /** The text as crengine stores it, as a JavaScript string (UTF-16). */
  readonly text: string
  /**
   * A crengine caret (code points into {@link CrengineText.text}) as an index into the source
   * string. A caret that falls inside a collapsed run of whitespace lands after the character
   * that produced the space, which is the only choice that round-trips.
   */
  sourceOffset(creOffset: number): number
  /** An index into the source string as a crengine caret. */
  creOffset(sourceOffset: number): number
  /** A crengine caret as an index into {@link CrengineText.text}. */
  textOffset(creOffset: number): number
}

const isSpace = (char: string): boolean =>
  char === " " || char === "\t" || char === "\n" || char === "\r"

/**
 * Rewrite `source` the way crengine's parser would, and index the result the way crengine
 * counts it.
 *
 * `pre` is the element's parsed-as-pre state: `white-space: pre`, `pre-wrap`, `break-spaces`
 * or `pre-line` (`css_ws_pre_line` and up, `cssdef.h:88`). The caller resolves that, because
 * it depends on the cascade and on the tag table.
 */
export function crengineText(
  source: string,
  pre = false,
  stripLeadingNewline = false,
): CrengineText {
  // "In the HTML syntax, a leading newline character immediately following the pre element
  // start tag is stripped" (`lvtinydom.cpp:9029`), for `<textarea>` too. One character, only
  // while the element has no children yet, which is the caller's question to answer.
  if (stripLeadingNewline && source.startsWith("\n")) {
    const inner = crengineText(source.slice(1), pre)
    return {
      text: inner.text,
      sourceOffset: (offset: number): number => inner.sourceOffset(offset) + 1,
      creOffset: (offset: number): number =>
        inner.creOffset(Math.max(0, offset - 1)),
      textOffset: (offset: number): number => inner.textOffset(offset),
    }
  }
  // Nothing to rewrite in the common case, and then the offsets are the caller's own — but
  // only while one crengine character is one JavaScript unit, which stops being true as soon
  // as the text has a character outside the Basic Multilingual Plane.
  if (
    !pre &&
    !hasCollapseableSpace(source) &&
    // Astral characters are one crengine character and two JavaScript units.
    !/[\uD800-\uDBFF]/.test(source)
  ) {
    return {
      text: source,
      sourceOffset: (offset: number) => offset,
      creOffset: (offset: number) => offset,
      textOffset: (offset: number) => offset,
    }
  }

  const afterCre: number[] = [0]
  const creAt = new Int32Array(source.length + 1)
  const units: number[] = [0]
  let text = ""
  let cre = 0
  let column = 0
  let afterSpace = false

  // `afterCre[j]` is the index in `source` just past the character that produced the j-th
  // crengine character; `creAt[i]` is how many crengine characters the source characters
  // starting before index `i` produced; `units[j]` is how many UTF-16 units the first j
  // crengine characters occupy. All three are indexed by crengine caret, not by UTF-16 unit.
  let index = 0
  for (const char of source) {
    // Every unit of this code point maps to the caret before it, so that a caret landing
    // between the halves of a surrogate pair cannot move backwards.
    for (let i = 0; i < char.length; i++) creAt[index + i] = cre
    const start = cre
    if (pre) {
      if (char === "\n" || char === "\r") column = 0
      if (char === "\t") {
        const delta = 8 - (column & 7)
        text += " ".repeat(delta)
        cre += delta
        column += delta
      } else {
        text += char
        cre += 1
        column += 1
      }
      afterSpace = false
    } else if (isSpace(char)) {
      if (!afterSpace) {
        text += " "
        cre += 1
      }
      afterSpace = true
    } else {
      text += char
      cre += 1
      afterSpace = false
    }
    // Indexed by crengine caret, so only the carets this character produced get an entry.
    for (let j = start + 1; j <= cre; j++) {
      afterCre[j] = index + char.length
      units[j] = text.length
    }
    index += char.length
  }
  creAt[source.length] = cre

  return {
    text,
    sourceOffset: (offset: number): number => {
      if (offset <= 0) return 0
      if (offset >= cre) return source.length
      return afterCre[offset] ?? source.length
    },
    creOffset: (offset: number): number => {
      if (offset <= 0) return 0
      if (offset >= source.length) return cre
      return creAt[clamp(offset, source.length)] ?? cre
    },
    textOffset: (offset: number): number => {
      if (offset <= 0) return 0
      if (offset >= cre) return text.length
      return units[offset] ?? text.length
    },
  }
}

function hasCollapseableSpace(source: string): boolean {
  // Only whitespace runs of two, or a newline, a tab or a carriage return, change anything.
  return /[\t\r\n]|\u0020{2}/.test(source)
}

function clamp(value: number, max: number): number {
  return value < 0 ? 0 : value > max ? max : value
}
