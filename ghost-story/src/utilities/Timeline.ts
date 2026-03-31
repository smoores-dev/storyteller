import { startsWithSpacelessScript } from "./SpacelessScripts.ts"

export type TimelineEntryType =
  | "segment"
  | "paragraph"
  | "sentence"
  | "clause"
  | "phrase"
  | "word"
  | "token"
  | "letter"
  | "phone"
  | "subphone"

export interface TimelineEntry {
  type: TimelineEntryType
  text: string
  startTime: number
  endTime: number
  startOffsetUtf16?: number
  endOffsetUtf16?: number
  startOffsetUtf32?: number
  endOffsetUtf32?: number
  confidence?: number
  id?: number
  timeline?: Timeline
}

export type Timeline = TimelineEntry[]

export function addWordTextOffsetsToTimelineInPlace(
  timeline: Timeline,
  text: string,
) {
  const { utf16To32Mapping } = getUTF32Chars(text)

  let currentOffset = 0

  function processTimeline(timeline: Timeline) {
    let lastEndOffset = 0

    for (const entry of timeline) {
      if (entry.type === "word") {
        let word = entry.text

        word = word.trim().replaceAll(/\s+/g, " ")

        const wordParts = word.split(" ")

        let startOffset: number | undefined
        let endOffset: number | undefined

        for (let i = 0; i < wordParts.length; i++) {
          const wordPart = wordParts[i]

          if (!wordPart) {
            continue
          }

          const wordPartOffset = text.indexOf(wordPart, currentOffset)

          if (wordPartOffset === -1) {
            continue
          }

          currentOffset = wordPartOffset + (wordParts[i]?.length ?? 0)

          if (i === 0) {
            startOffset = wordPartOffset
          }

          endOffset = currentOffset
        }

        const startOffsetUtf16 = startOffset ?? lastEndOffset
        const endOffsetUtf16 = endOffset ?? lastEndOffset
        entry.startOffsetUtf16 = startOffsetUtf16
        entry.endOffsetUtf16 = endOffsetUtf16

        const startOffsetUtf32 = utf16To32Mapping[startOffsetUtf16]
        const endOffsetUtf32 = utf16To32Mapping[endOffsetUtf16]

        if (startOffsetUtf32 === undefined || endOffsetUtf32 === undefined) {
          console.error("startOffsetUtf32 or endOffsetUtf32 is undefined", {
            startOffsetUtf16,
            endOffsetUtf16,
            utf16To32Mapping,
          })
          throw new Error("startOffsetUtf32 or endOffsetUtf32 is undefined")
        }

        entry.startOffsetUtf32 = startOffsetUtf32
        entry.endOffsetUtf32 = endOffsetUtf32

        if (endOffset !== undefined) {
          lastEndOffset = endOffset
        }
      } else if (entry.timeline) {
        processTimeline(entry.timeline)
      }
    }
  }

  processTimeline(timeline)
  return
}

export function getUTF32Chars(str: string) {
  const utf32chars: string[] = []
  const utf16To32Mapping: number[] = []

  let utf32Index = 0

  for (const utf32char of str) {
    utf32chars.push(utf32char)

    for (let i = 0; i < utf32char.length; i++) {
      utf16To32Mapping.push(utf32Index)
    }

    utf32Index += 1
  }

  utf16To32Mapping.push(utf32Index)

  return { utf32chars, utf16To32Mapping }
}

/**
 * builds transcript string by joining all word entries from the timeline.
 * this ensures exact alignment between timeline words and transcript text,
 * which is required for {@link addWordTextOffsetsToTimelineInPlace} to work correctly.
 */
export function buildTranscriptFromTimeline(timeline: Timeline): string {
  const words: string[] = []

  function collectWords(entries: Timeline) {
    for (let i = 0; i < entries.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const entry = entries[i]!

      if (entry.timeline) {
        collectWords(entry.timeline)
        continue
      }

      if (!startsWithSpacelessScript(entry.text) && i !== entries.length - 1) {
        words.push(entry.text)
        words.push(" ")
        continue
      }

      words.push(entry.text)
    }
  }

  collectWords(timeline)

  return words.join("")
}

export function addTimeOffsetToTimeline(
  targetTimeline: Timeline,
  timeOffset: number,
) {
  const newTimeline = structuredClone(targetTimeline)

  for (const segmentTimelineEntry of newTimeline) {
    segmentTimelineEntry.startTime = Math.max(
      segmentTimelineEntry.startTime + timeOffset,
      0,
    )
    segmentTimelineEntry.endTime = Math.max(
      segmentTimelineEntry.endTime + timeOffset,
      0,
    )

    if (segmentTimelineEntry.timeline) {
      segmentTimelineEntry.timeline = addTimeOffsetToTimeline(
        segmentTimelineEntry.timeline,
        timeOffset,
      )
    }
  }

  return newTimeline
}
