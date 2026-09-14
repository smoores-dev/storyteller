export type ChapterAudioClip = {
  fragment: string
  audio: string
  start: number
  end: number
  audioOnly: boolean
  heard: string | null
}

export type ChapterAudio = {
  source: "emissions" | "transcription" | null
  clips: ChapterAudioClip[]
}

export type DriftFlag =
  | "soundsLikeNext"
  | "soundsLikePrevious"
  | "startsLate"
  | "startsEarly"
  | "runsOn"
  | "mismatch"

export type SentenceAudit = {
  fragment: string
  audio: string
  start: number
  end: number
  holeSeconds: number
  cps: number | null
  pace: "slow" | "fast" | null
  heard: string | null
  match: number | null
  flags: DriftFlag[]
}

export type ChapterAudit = {
  medianCps: number | null
  sentences: Map<string, SentenceAudit>
}

const EDGE = 20
const EDGE_MARGIN = 0.35
const NEIGHBOUR_MARGIN = 0.2
const NEIGHBOUR_CEILING = 0.6
const MISMATCH = 0.35
const SLOW = 0.5
const FAST = 2
const MIN_PACE_SECONDS = 0.3
const MIN_PACE_CHARS = 12

function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2)
    counts.set(pair, (counts.get(pair) ?? 0) + 1)
  }
  return counts
}

export function similarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const left = bigrams(a)
  const right = bigrams(b)
  let shared = 0
  for (const [pair, count] of left) {
    shared += Math.min(count, right.get(pair) ?? 0)
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1))
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

export function auditChapterAudio(
  audio: ChapterAudio,
  textOf: (fragment: string) => string | null,
): ChapterAudit {
  const groups = new Map<
    string,
    { clip: ChapterAudioClip | null; heard: string[]; holeSeconds: number }
  >()
  for (const clip of audio.clips) {
    const group = groups.get(clip.fragment) ?? {
      clip: null,
      heard: [],
      holeSeconds: 0,
    }
    groups.set(clip.fragment, group)
    if (clip.audioOnly) {
      group.holeSeconds += clip.end - clip.start
    } else {
      group.clip ??= clip
    }
    if (clip.heard !== null) group.heard.push(clip.heard)
  }

  const sentences: SentenceAudit[] = []
  const texts: string[] = []
  for (const [fragment, group] of groups) {
    if (!group.clip) continue
    const text = textOf(fragment)?.trim() ?? ""
    const duration = group.clip.end - group.clip.start
    texts.push(normalize(text))
    sentences.push({
      fragment,
      audio: group.clip.audio,
      start: group.clip.start,
      end: group.clip.end,
      holeSeconds: group.holeSeconds,
      cps:
        duration >= MIN_PACE_SECONDS && text.length >= MIN_PACE_CHARS
          ? text.length / duration
          : null,
      pace: null,
      heard: audio.source === null ? null : group.heard.join(" "),
      match: null,
      flags: [],
    })
  }

  const medianCps = median(
    sentences.flatMap((sentence) =>
      sentence.cps === null ? [] : [sentence.cps],
    ),
  )

  const flags = sentences.map(() => new Set<DriftFlag>())
  for (const [i, sentence] of sentences.entries()) {
    if (medianCps !== null && sentence.cps !== null) {
      sentence.pace =
        sentence.cps < medianCps * SLOW
          ? "slow"
          : sentence.cps > medianCps * FAST
            ? "fast"
            : null
    }

    if (sentence.heard === null) continue
    const heard = normalize(sentence.heard)
    const text = texts[i] ?? ""
    if (text.length === 0) continue

    const match = similarity(heard, text)
    sentence.match = match
    const next = texts[i + 1]
    const previous = texts[i - 1]

    if (match < NEIGHBOUR_CEILING && heard.length >= EDGE / 2) {
      if (next && similarity(heard, next) > match + NEIGHBOUR_MARGIN) {
        flags[i]?.add("soundsLikeNext")
      }
      if (previous && similarity(heard, previous) > match + NEIGHBOUR_MARGIN) {
        flags[i]?.add("soundsLikePrevious")
      }
    }

    if (heard.length >= EDGE && text.length >= EDGE && match < MISMATCH) {
      flags[i]?.add("mismatch")
    }

    if (heard.length < EDGE || text.length < EDGE) continue

    if (next !== undefined && next.length >= EDGE) {
      const tail = heard.slice(-EDGE)
      if (
        similarity(tail, next.slice(0, EDGE)) >
        similarity(tail, text.slice(-EDGE)) + EDGE_MARGIN
      ) {
        flags[i]?.add("runsOn")
        flags[i + 1]?.add("startsLate")
      }
    }

    if (previous !== undefined && previous.length >= EDGE) {
      const head = heard.slice(0, EDGE)
      if (
        similarity(head, previous.slice(-EDGE)) >
        similarity(head, text.slice(0, EDGE)) + EDGE_MARGIN
      ) {
        flags[i]?.add("startsEarly")
      }
    }
  }

  const order: DriftFlag[] = [
    "soundsLikeNext",
    "soundsLikePrevious",
    "startsLate",
    "startsEarly",
    "runsOn",
    "mismatch",
  ]
  for (const [i, sentence] of sentences.entries()) {
    sentence.flags = order.filter((flag) => flags[i]?.has(flag))
  }

  return {
    medianCps,
    sentences: new Map(
      sentences.map((sentence) => [sentence.fragment, sentence]),
    ),
  }
}
