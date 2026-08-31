import { type EmissionsReader } from "../../emit/fs.ts"

export function argmax(vector: number[]) {
  let best = 0
  for (let i = 1; i < vector.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (vector[i]! > vector[best]!) best = i
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
  for await (const row of emissionsReader.frames()) {
    const best = argmax(row)

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

  return { text: chars.join(""), frames }
}
