import { type EmissionsReader } from "../../emit/fs.ts"

export function argmax(values: Float32Array, offset: number, length: number) {
  let best = 0
  for (let i = 1; i < length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (values[offset + i]! > values[offset + best]!) best = i
  }

  return best
}

/**
 * Returns the decoded text along with, for each character, the emission
 * frame at which it was first observed.
 */
export async function ctcGreedyDecode(
  emissionsReader: EmissionsReader,
): Promise<{ text: string; frames: number[] }> {
  const charByToken = new Map<number, string>()
  for (const [char, id] of emissionsReader.vocab.entries()) {
    if (id !== emissionsReader.blankId && char.length === 1 && char !== "|") {
      charByToken.set(id, char)
    }
  }

  const chars: string[] = []
  const frames: number[] = []

  let previous = -1
  let t = 0
  for await (const {
    values,
    frames: count,
    classes,
  } of emissionsReader.blocks()) {
    for (let f = 0; f < count; f++) {
      const best = argmax(values, f * classes, classes)

      if (best !== previous) {
        const char = charByToken.get(best)
        if (char !== undefined) {
          chars.push(char)
          frames.push(t)
        }
      }
      previous = best
      t++
    }
  }

  return { text: chars.join(""), frames }
}
