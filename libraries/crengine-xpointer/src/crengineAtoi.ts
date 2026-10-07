/**
 * `lString32::atoi`, ported.
 *
 * crengine runs every index in an xpointer through its own string→int converter
 * (`lvstring.cpp:1130-1167`), and it is not `parseInt`: it accepts leading spaces and
 * tabs, a `+` or `-` sign, and `0x` hex, and it yields `0` — not a partial value — when
 * the digits are followed by anything other than a space, a tab, or the end of the
 * string, or when they overflow 32 bits.
 *
 * That is observable in xpointers: `p[-1]` means "no index", `p[0x10]` means `p[16]`,
 * and `p[2x]` matches nothing at all.
 */

const INT_MAX = 0x7fffffff
const INT_MAX_OVER_10 = 214748364 // C++ `INT_MAX/10`

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9"
}

/** `hexDigit()` from lvstring.cpp:1091 — 0..15, or -1. */
function hexDigit(char: string | undefined): number {
  if (char === undefined) return -1
  if (char >= "0" && char <= "9") return char.charCodeAt(0) - 48
  if (char >= "a" && char <= "f") return char.charCodeAt(0) - 87
  if (char >= "A" && char <= "F") return char.charCodeAt(0) - 55
  return -1
}

export function crengineAtoi(value: string): number {
  let pos = 0
  while (value[pos] === " " || value[pos] === "\t") pos++

  if (value[pos] === "0" && value[pos + 1] === "x") {
    // The hex form ignores trailing garbage and always "succeeds".
    let n = 0
    for (pos += 2; pos < value.length; pos++) {
      const digit = hexDigit(value[pos])
      if (digit >= 0) n = (n << 4) | digit
    }
    return n | 0
  }

  let sign = 1
  if (value[pos] === "-") {
    sign = -1
    pos++
  } else if (value[pos] === "+") {
    pos++
  }

  if (!isDigit(value[pos])) return 0

  let n = 0
  while (isDigit(value[pos])) {
    if (n > INT_MAX_OVER_10) return 0
    n = n * 10 + (value.charCodeAt(pos) - 48)
    pos++
  }
  if (!(pos === value.length || value[pos] === " " || value[pos] === "\t"))
    return 0
  n = sign < 0 ? -n : n
  // crengine lets the last digits wrap past INT_MAX; out of range indexes can only ever
  // fail to match, and 0 fails to match too, so saturating here keeps the behaviour that
  // is observable through the public API.
  return n > INT_MAX ? 0 : n
}
