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
export function ctcGreedyDecode(
  emissions: number[][],
  blankIndex: number,
  vocab: Map<string, number>,
): { text: string; frames: number[] } {
  const charByToken = new Map<number, string>()
  for (const [char, id] of vocab.entries()) {
    if (id !== blankIndex && char.length === 1 && char !== "|") {
      charByToken.set(id, char)
    }
  }

  const chars: string[] = []
  const frames: number[] = []

  let previous = -1
  for (let t = 0; t < emissions.length; t++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = emissions[t]!
    const best = argmax(row)

    if (best !== previous) {
      const char = charByToken.get(best)
      if (char !== undefined) {
        chars.push(char)
        frames.push(t)
      }
    }
    previous = best
  }

  return { text: chars.join(""), frames }
}
