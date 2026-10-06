import { type FileHandle, open, readFile } from "node:fs/promises"
import { basename, extname, join } from "node:path/posix"

import {
  framesToSeconds,
  secondsToFrames,
} from "@storyteller-platform/align/emissions"
import {
  type Epub,
  findXmlChildByName,
  isElement,
  type ManifestItem,
  type Node as DomNode,
  parse,
} from "@storyteller-platform/epub"
import { decodeEmissions } from "@storyteller-platform/ghost-story/emission-encoding"

import { type ChapterAudio, type ChapterAudioClip } from "@/chapterAudio"

const AUDIO_ONLY_TYPE = "storyteller:audio-only"

type Par = Omit<ChapterAudioClip, "heard">

type Heard = { text: string; time: number }

type TranscriptWord = { text: string; startTime: number; endTime: number }

function parseClock(value: string | null | undefined): number | null {
  if (!value) return null
  if (value.endsWith("ms")) return parseFloat(value) / 1000
  if (value.endsWith("min")) return parseFloat(value) * 60
  if (value.endsWith("h")) return parseFloat(value) * 3600
  if (value.endsWith("s")) return parseFloat(value)
  const parts = value.split(":").map(Number)
  if (parts.some(Number.isNaN)) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function parsOf(nodes: DomNode[]): Par[] {
  const pars: Par[] = []
  for (const node of nodes) {
    if (!isElement(node)) continue
    const children = Array.from(node.childNodes)
    if (node.nodeName !== "par") {
      pars.push(...parsOf(children))
      continue
    }
    const text = findXmlChildByName("text", node)
    const audio = findXmlChildByName("audio", node)
    const fragment = text?.getAttribute("src")?.split("#")[1]
    const src = audio?.getAttribute("src")
    const start = parseClock(audio?.getAttribute("clipBegin"))
    const end = parseClock(audio?.getAttribute("clipEnd"))
    if (!fragment || !src || start === null || end === null) continue
    pars.push({
      fragment,
      audio: basename(decodeURIComponent(src)),
      start,
      end,
      audioOnly: node.getAttribute("epub:type") === AUDIO_ONLY_TYPE,
    })
  }
  return pars
}

async function heardFromEmissions(
  filepath: string,
  from: number,
  to: number,
): Promise<Heard[] | null> {
  let file: FileHandle
  try {
    file = await open(filepath, "r")
  } catch {
    return null
  }

  try {
    const getBytes = async (bytesFrom: number, bytesTo: number) => {
      const buffer = new Uint8Array(bytesTo - bytesFrom)
      let read = 0
      while (read < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          read,
          buffer.length - read,
          bytesFrom + read,
        )
        if (bytesRead === 0) break
        read += bytesRead
      }
      return buffer
    }

    const head = await decodeEmissions(getBytes, 0, 0)
    const firstFrame = Math.max(0, secondsToFrames(from, head))
    const lastFrame = Math.min(head.numFrames, secondsToFrames(to, head) + 1)
    if (lastFrame <= firstFrame) return []

    const { emissions, vocab, blankIndex } = await decodeEmissions(
      getBytes,
      firstFrame,
      lastFrame,
    )
    const tokens = new Map([...vocab].map(([token, id]) => [id, token]))

    const heard: Heard[] = []
    let previous = -1
    for (let frame = 0; frame < emissions.frames; frame++) {
      const offset = frame * emissions.classes
      let best = 0
      for (let c = 1; c < emissions.classes; c++) {
        if (
          (emissions.values[offset + c] ?? -Infinity) >
          (emissions.values[offset + best] ?? -Infinity)
        ) {
          best = c
        }
      }
      if (best !== previous && best !== blankIndex) {
        const token = tokens.get(best) ?? ""
        const text =
          token === "|"
            ? " "
            : token.startsWith("<") && token.endsWith(">")
              ? ""
              : token.replaceAll("▁", " ")
        if (text) {
          heard.push({ text, time: framesToSeconds(firstFrame + frame, head) })
        }
      }
      previous = best
    }
    return heard
  } finally {
    await file.close()
  }
}

async function heardFromTranscription(
  filepath: string,
): Promise<Heard[] | null> {
  const raw = await readFile(filepath, "utf-8").catch(() => null)
  if (raw === null) return null
  const parsed = JSON.parse(raw) as {
    timeline?: TranscriptWord[]
    wordTimeline?: TranscriptWord[]
  }
  return (parsed.timeline ?? parsed.wordTimeline ?? []).map((word) => ({
    text: `${word.text} `,
    time: (word.startTime + word.endTime) / 2,
  }))
}

function lowerBound(heard: Heard[], time: number): number {
  let low = 0
  let high = heard.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((heard[middle]?.time ?? Infinity) < time) low = middle + 1
    else high = middle
  }
  return low
}

export async function readChapterAudio(
  epub: Epub,
  overlay: ManifestItem,
  directories: { emissions: string; transcriptions: string },
): Promise<ChapterAudio> {
  const smil = await epub.readItemContents(overlay.id, "utf-8")
  const pars = parsOf(Array.from(parse(smil, "text/xml").childNodes))

  const byAudio = new Map<string, Par[]>()
  for (const par of pars) {
    const list = byAudio.get(par.audio) ?? []
    list.push(par)
    byAudio.set(par.audio, list)
  }

  let source: ChapterAudio["source"] = null
  const heardByAudio = new Map<string, Heard[]>()
  for (const [audio, list] of byAudio) {
    const stem = basename(audio, extname(audio))
    const from = Math.min(...list.map((par) => par.start))
    const to = Math.max(...list.map((par) => par.end))

    const fromEmissions = await heardFromEmissions(
      join(directories.emissions, `${stem}.emissions`),
      from,
      to,
    )
    if (fromEmissions) {
      source ??= "emissions"
      heardByAudio.set(audio, fromEmissions)
      continue
    }

    const fromTranscription = await heardFromTranscription(
      join(directories.transcriptions, `${stem}.json`),
    )
    if (fromTranscription) {
      source ??= "transcription"
      heardByAudio.set(audio, fromTranscription)
    }
  }

  return {
    source,
    clips: pars.map((par) => {
      const heard = heardByAudio.get(par.audio)
      if (!heard) return { ...par, heard: null }
      const units: string[] = []
      for (let i = lowerBound(heard, par.start); i < heard.length; i++) {
        const unit = heard[i]
        if (!unit || unit.time >= par.end) break
        units.push(unit.text)
      }
      return { ...par, heard: units.join("").replace(/\s+/g, " ").trim() }
    }),
  }
}
