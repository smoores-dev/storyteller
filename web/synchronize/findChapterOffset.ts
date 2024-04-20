import { findNearestMatch } from "./fuzzy"

const OFFSET_SEARCH_WINDOW_SIZE = 5000

export async function findBestOffset(
  epubSentences: string[],
  transcriptionText: string,
  lastMatchOffset: number,
) {
  let i = 0
  while (i < transcriptionText.length) {
    let startSentence = 0

    const startIndex = (lastMatchOffset + i) % transcriptionText.length
    const endIndex =
      (startIndex + OFFSET_SEARCH_WINDOW_SIZE) % transcriptionText.length

    const transcriptionTextSlice: string =
      endIndex > startIndex
        ? transcriptionText.slice(startIndex, endIndex)
        : transcriptionText.slice(startIndex) +
          transcriptionText.slice(0, endIndex)

    while (startSentence < epubSentences.length) {
      const queryString = epubSentences
        .slice(startSentence, startSentence + 6)
        .join(" ")

      const firstMatch = await findNearestMatch(
        queryString.toLowerCase(),
        transcriptionTextSlice.toLowerCase(),
        {
          max_l_dist: Math.floor(0.1 * queryString.length),
        },
      )

      if (firstMatch) {
        return {
          startSentence,
          transcriptionOffset:
            (firstMatch.start + startIndex) % transcriptionText.length,
        }
      }

      startSentence += 3
    }

    i += Math.floor(OFFSET_SEARCH_WINDOW_SIZE / 2)
  }

  return { startSentence: 0, transcriptionOffset: null }
}
