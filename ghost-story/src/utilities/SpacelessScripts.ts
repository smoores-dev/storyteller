interface ScriptRange {
  name: string
  from: number
  to: number
}

// scripts where words are not separated by spaces.
// CJK punctuation (U+3000-303F) is intentionally excluded
// so that characters like 。 and 、 still attach to the prior word.
export const spacelessScripts: readonly ScriptRange[] = [
  { name: "thai", from: 0x0e01, to: 0x0e4f },
  { name: "lao", from: 0x0e81, to: 0x0edf },
  { name: "tibetan", from: 0x0f00, to: 0x0fff },
  { name: "myanmar", from: 0x1000, to: 0x109f },
  { name: "khmer", from: 0x1780, to: 0x17ff },
  { name: "hiragana", from: 0x3040, to: 0x309f },
  { name: "katakana", from: 0x30a0, to: 0x30ff },
  { name: "cjk-ext-a", from: 0x3400, to: 0x4dbf },
  { name: "cjk-unified", from: 0x4e00, to: 0x9fff },
  { name: "cjk-compat", from: 0xf900, to: 0xfaff },
]

const charClass = spacelessScripts
  .map((s) => `${String.fromCharCode(s.from)}-${String.fromCharCode(s.to)}`)
  .join("")

export const spacelessScriptPattern = new RegExp(`[${charClass}]`)

export function startsWithSpacelessScript(text: string): boolean {
  return spacelessScriptPattern.test(text.charAt(0))
}
