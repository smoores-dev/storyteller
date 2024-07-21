import levenshtein from "js-levenshtein"

export function* findCandidates(
  needle: string,
  haystack: string,
  candidateLength: number,
  maxDist: number,
) {
  for (
    let candidateStart = 0;
    candidateStart < haystack.length - candidateLength;
    candidateStart += maxDist
  ) {
    const candidate = haystack.slice(
      candidateStart,
      candidateStart + candidateLength,
    )
    const score = levenshtein(needle, candidate)
    if (score > maxDist * 2) continue
    yield { match: candidate, index: candidateStart, score }
  }
}

export function findNearestMatch(
  needle: string,
  haystack: string,
  maxDist: number,
) {
  let nearest: { match: string; index: number; score: number } | null = null
  for (const initialCandidate of findCandidates(
    needle,
    haystack,
    needle.length,
    maxDist,
  )) {
    if (
      initialCandidate.score <= maxDist &&
      (!nearest || initialCandidate.score < nearest.score)
    ) {
      nearest = initialCandidate
    }
    for (
      let candidateLength = needle.length + maxDist - 1;
      candidateLength >= needle.length - maxDist;
      candidateLength--
    ) {
      const candidate = haystack.slice(
        initialCandidate.index,
        initialCandidate.index + candidateLength,
      )
      const score = levenshtein(needle, candidate)
      if (score > maxDist) continue
      if (!nearest || score < nearest.score) {
        nearest = { match: candidate, index: initialCandidate.index, score }
      }
    }
  }

  return nearest
}
