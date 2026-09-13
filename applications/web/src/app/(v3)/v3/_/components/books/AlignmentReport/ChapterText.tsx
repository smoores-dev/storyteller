"use client"

import { GuidedNavigationDocument } from "@readium/shared"
import { skipToken } from "@reduxjs/toolkit/query"
import { useEffect, useMemo, useRef, useState } from "react"

import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ReportSpan, type ViewSpineItem } from "@/alignmentReportView"
import { play, usePlayerSelector } from "@/app/(v3)/v3/_/components/audio"
import * as icon from "@/icons"
import { sanitizeHtml } from "@/sanitizeHtml"
import {
  useGetBookChapterGuidedNavigationQuery,
  useGetBookChapterTextQuery,
} from "@/store/api"
import { type UUID } from "@/uuid"

import { readStored, store } from "./shared"

const STRIP_SELECTOR = "script, style, link, img, svg, video, audio, iframe"

const STATE = "data-state"
const MATCH = "data-match"
const READABLE = "data-readable"
const READING = "data-reading"
const FOLLOW_KEY = "alignment-report:chapter-text:follow"
const PROBLEM_SELECTOR = `[${STATE}=interpolated], [${STATE}=dropped]`

type Sentence = {
  fragmentId: string
  path: string
  start: number
  end: number
  text: string
}

function sentencesOf(guidedNavigation: unknown): Sentence[] {
  const document = GuidedNavigationDocument.deserialize(guidedNavigation)
  const sentences: Sentence[] = []
  for (const guided of document?.guided ?? []) {
    for (const child of guided.children ?? []) {
      const clip = child.clip
      const fragmentId = child.fragmentId
      if (!clip || !fragmentId) continue
      const path = clip.audioResource.split("/").pop()
      if (!path || clip.start === undefined || clip.end === undefined) continue
      sentences.push({
        fragmentId,
        path,
        start: clip.start,
        end: clip.end,
        text: child.plainText ?? "",
      })
    }
  }
  return sentences.toSorted(
    (a, b) => a.path.localeCompare(b.path) || a.start - b.start,
  )
}

function readingFragment(
  sentences: Sentence[],
  path: string,
  time: number,
): string | null {
  let current: Sentence | null = null
  for (const sentence of sentences) {
    if (sentence.path !== path) continue
    if (sentence.start > time) {
      return current !== null ? current.fragmentId : null
    }
    current = sentence
  }
  return current !== null && time < current.end ? current.fragmentId : null
}

type Bounds = { first: number; last: number }

function matchedBounds(spans: ReportSpan[]): Bounds | null {
  const aligned = spans
    .filter((span) => span.state === "aligned")
    .toSorted((a, b) => a.firstSentence - b.firstSentence)
  const first = aligned[0]
  const last = aligned.at(-1)
  return first && last
    ? { first: first.firstSentence, last: last.lastSentence }
    : null
}

type Range = { start: number; end: number }

function sentencePattern(sentence: string): RegExp | null {
  const tokens = sentence.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const escaped = tokens.map((token) =>
    token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  )
  return new RegExp(escaped.join("\\s+"))
}

function textNodesOf(root: Node): Text[] {
  const walker = root.ownerDocument?.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  )
  const nodes: Text[] = []
  if (!walker) return nodes
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push(node as Text)
  }
  return nodes
}

function wrap(node: Text, attribute: string, value = "") {
  const document = node.ownerDocument
  const span = document.createElement("span")
  span.setAttribute(attribute, value)
  node.parentNode?.replaceChild(span, node)
  span.appendChild(node)
}

function wrapOffsets(
  body: HTMLElement,
  range: Range,
  attribute: string,
  value = "",
) {
  if (range.end <= range.start) return
  let offset = 0
  for (const node of textNodesOf(body)) {
    const nodeStart = offset
    const nodeEnd = offset + node.data.length
    offset = nodeEnd
    if (nodeEnd <= range.start || nodeStart >= range.end) continue
    let target = node
    if (nodeStart < range.start) {
      target = target.splitText(range.start - nodeStart)
    }
    const targetStart = Math.max(nodeStart, range.start)
    if (nodeEnd > range.end) {
      target.splitText(range.end - targetStart)
    }
    wrap(target, attribute, value)
  }
}

function sentenceElement(body: HTMLElement, id: number): Element | null {
  return body.querySelector(`[id$="-s${id}"]`)
}

function markById(
  body: HTMLElement,
  spans: ReportSpan[],
  bounds: Bounds,
): boolean {
  const start = sentenceElement(body, bounds.first)
  const end = sentenceElement(body, bounds.last)
  if (!start || !end) return false
  for (const span of spans) {
    for (let id = span.firstSentence; id <= span.lastSentence; id++) {
      sentenceElement(body, id)?.setAttribute(STATE, span.state)
    }
  }
  start.setAttribute(MATCH, "first")
  end.setAttribute(MATCH, "last")
  return true
}

function boundsFromText(
  body: HTMLElement,
  item: ViewSpineItem,
): { first: Range; last: Range } | null {
  if (!item.firstMatch || !item.lastMatch) return null
  const text = body.textContent
  const first = sentencePattern(item.firstMatch.matchedSentence)
  const last = sentencePattern(item.lastMatch.matchedSentence)
  const firstMatch = first ? first.exec(text) : null
  if (!firstMatch) return null
  const rest = text.slice(firstMatch.index)
  const lastMatch = last ? last.exec(rest) : null
  const firstRange = {
    start: firstMatch.index,
    end: firstMatch.index + firstMatch[0].length,
  }
  const lastRange = lastMatch
    ? {
        start: firstMatch.index + lastMatch.index,
        end: firstMatch.index + lastMatch.index + lastMatch[0].length,
      }
    : { start: text.length, end: text.length }
  return { first: firstRange, last: lastRange }
}

function markMatches(
  body: HTMLElement,
  item: ViewSpineItem,
  spans: ReportSpan[],
): boolean {
  const bounds = matchedBounds(spans)
  if (bounds && markById(body, spans, bounds)) return true

  const byText = boundsFromText(body, item)
  if (!byText) return false
  const length = body.textContent.length
  wrapOffsets(body, byText.first, MATCH, "first")
  wrapOffsets(body, byText.last, MATCH, "last")
  wrapOffsets(body, { start: 0, end: byText.first.start }, STATE, "unmatched")
  wrapOffsets(body, { start: byText.last.end, end: length }, STATE, "unmatched")
  return true
}

function prepare(
  xhtml: string,
  item: ViewSpineItem,
  spans: ReportSpan[],
): { html: string; marked: boolean } {
  const parsed = new DOMParser().parseFromString(xhtml, "application/xhtml+xml")
  const failed = parsed.querySelector("parsererror")
  const document = failed
    ? new DOMParser().parseFromString(xhtml, "text/html")
    : parsed
  const body = document.body
  for (const element of body.querySelectorAll(STRIP_SELECTOR)) {
    element.remove()
  }
  const marked = markMatches(body, item, spans)
  return { html: sanitizeHtml(body.innerHTML), marked }
}

function centeredTop(container: HTMLElement, target: Element): number {
  const box = container.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  const top =
    container.scrollTop +
    (rect.top - box.top) -
    container.clientHeight / 2 +
    rect.height / 2
  return Math.min(
    Math.max(top, 0),
    container.scrollHeight - container.clientHeight,
  )
}

function sentenceNumber(element: Element): number {
  return Number(/-s(\d+)$/.exec(element.id)?.[1] ?? Number.NaN)
}

function problemAreas(container: HTMLElement): Element[] {
  const areas: Element[] = []
  let previous: Element | null = null
  for (const element of container.querySelectorAll(PROBLEM_SELECTOR)) {
    const continues =
      previous !== null &&
      previous.getAttribute(STATE) === element.getAttribute(STATE) &&
      sentenceNumber(previous) + 1 === sentenceNumber(element)
    if (!continues) areas.push(element)
    previous = element
  }
  return areas
}

function stepProblem(container: HTMLElement, direction: 1 | -1) {
  const current = container.scrollTop
  const tops = problemAreas(container).map((area) =>
    centeredTop(container, area),
  )
  const target =
    direction === 1
      ? tops.find((top) => top > current + 1)
      : tops.findLast((top) => top < current - 1)
  if (target === undefined) return
  container.scrollTo({ top: target, behavior: "smooth" })
}

export function ChapterText({
  bookUuid,
  item,
  spans,
  className,
}: {
  bookUuid: UUID
  item: ViewSpineItem
  spans: ReportSpan[]
  className?: string
}) {
  const t = useTranslation("AlignmentReport")
  const notAligned = item.status !== "aligned"
  const container = useRef<HTMLDivElement>(null)
  const {
    currentData: data,
    isFetching,
    isError,
  } = useGetBookChapterTextQuery(
    item.readHref
      ? {
          uuid: bookUuid,
          updatedAt: new Date().toISOString(),
          href: item.readHref,
        }
      : skipToken,
  )
  const { currentData: guidedNavigation } =
    useGetBookChapterGuidedNavigationQuery(
      item.readHref && !notAligned
        ? {
            uuid: bookUuid,
            updatedAt: new Date().toISOString(),
            href: item.readHref,
          }
        : skipToken,
    )

  const prepared = useMemo(
    () => (data === undefined ? null : prepare(data, item, spans)),
    [data, item, spans],
  )

  const sentences = useMemo(
    () => (guidedNavigation ? sentencesOf(guidedNavigation) : []),
    [guidedNavigation],
  )

  const readingId = usePlayerSelector((state) => {
    const clip = state.clip
    if (!clip || clip.bookUuid !== bookUuid) return null
    return readingFragment(sentences, clip.path, state.currentTime)
  })

  const [follow, setFollow] = useState(
    () => readStored(FOLLOW_KEY, (raw) => raw, "") === "1",
  )
  const [problemCount, setProblemCount] = useState(0)

  useEffect(() => {
    if (notAligned) return

    const element = container.current
    if (!element || !prepared) return
    element.scrollTop = 0
    const target = element.querySelector(`[${MATCH}="first"]`)
    if (!target) return
    const box = element.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    element.scrollTop = Math.max(0, rect.top - box.top - 24)
  }, [prepared, notAligned])

  useEffect(() => {
    const element = container.current
    if (!element || !prepared || sentences.length === 0) return
    const byFragment = new Map(
      sentences.map((sentence) => [sentence.fragmentId, sentence]),
    )
    for (const fragmentId of byFragment.keys()) {
      element
        .querySelector(`#${CSS.escape(fragmentId)}`)
        ?.setAttribute(READABLE, "")
    }
    const onClick = (event: MouseEvent) => {
      if (document.getSelection()?.isCollapsed === false) return
      for (
        let node = event.target as Element | null;
        node && node !== element;
        node = node.parentElement
      ) {
        const sentence = byFragment.get(node.id)
        if (!sentence) continue
        play({
          bookUuid,
          path: sentence.path,
          name: sentence.path,
          start: sentence.start,
          label: item.label,
          sublabel: sentence.text,
        })
        return
      }
    }
    element.addEventListener("click", onClick)
    return () => {
      element.removeEventListener("click", onClick)
    }
  }, [prepared, sentences, bookUuid, item.label])

  useEffect(() => {
    const element = container.current
    if (!element || !prepared || readingId === null) return
    const target = element.querySelector(`#${CSS.escape(readingId)}`)
    if (!target) return
    target.setAttribute(READING, "")
    if (follow) {
      const box = element.getBoundingClientRect()
      const rect = target.getBoundingClientRect()
      if (rect.top < box.top || rect.bottom > box.bottom) {
        element.scrollTo({
          top: centeredTop(element, target),
          behavior: "smooth",
        })
      }
    }
    return () => {
      target.removeAttribute(READING)
    }
  }, [prepared, readingId, follow])

  useEffect(() => {
    const element = container.current
    setProblemCount(element && prepared ? problemAreas(element).length : 0)
  }, [prepared])

  const unavailable = !item.readHref || isError

  return (
    <div className={cn("flex min-h-0 flex-col gap-1.5", className)}>
      {!notAligned && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-[10px]">
            {unavailable
              ? t("detail.textUnavailable")
              : !prepared || isFetching
                ? t("detail.loadingText")
                : prepared.marked
                  ? t("detail.textHint")
                  : t("detail.textUnmarkedHint")}
          </span>
          <TooltipButton
            variant="ghost"
            size="icon-xs"
            aria-label={t("detail.followAlong")}
            tooltip={t("detail.followAlong")}
            aria-pressed={follow}
            disabled={sentences.length === 0}
            className={cn(follow && "bg-muted text-foreground")}
            onClick={() => {
              setFollow(!follow)
              store(FOLLOW_KEY, follow ? "0" : "1")
            }}
          >
            <icon.ArrowAutofitDown />
          </TooltipButton>
          <TooltipButton
            variant="ghost"
            size="icon-xs"
            aria-label={t("detail.previousProblem")}
            tooltip={t("detail.previousProblem")}
            disabled={problemCount === 0}
            onClick={() => {
              if (container.current) stepProblem(container.current, -1)
            }}
          >
            <icon.ArrowUp />
          </TooltipButton>
          <TooltipButton
            variant="ghost"
            size="icon-xs"
            aria-label={t("detail.nextProblem")}
            tooltip={t("detail.nextProblem")}
            disabled={problemCount === 0}
            onClick={() => {
              if (container.current) stepProblem(container.current, 1)
            }}
          >
            <icon.ArrowDown />
          </TooltipButton>
        </div>
      )}
      <div
        ref={container}
        className={cn(
          "min-h-24 flex-1 overflow-y-auto rounded-md border px-4 py-3 text-[13px]/6",
          "[&_[data-state=interpolated]]:decoration-moderate/70 [&_[data-state=interpolated]]:text-moderate/70 [&_*]:font-sans! [&_[data-state=dropped]]:line-through [&_[data-state=dropped]]:opacity-35 [&_[data-state=interpolated]]:underline [&_[data-state=interpolated]]:decoration-dotted [&_[data-state=interpolated]]:decoration-2 [&_[data-state=interpolated]]:underline-offset-4 [&_[data-state=unmatched]]:opacity-35 [&_h1]:text-base [&_h1]:font-medium [&_h2]:text-sm [&_h2]:font-medium [&_h3]:font-medium [&_p]:my-2",
          "[&_[data-match]]:bg-highlight-bg/70 [&_[data-match]]:border-highlight [&_[data-match]]:dark:bg-highlight/25 [&_[data-match]]:border-b [&_[data-match]]:box-decoration-clone",
          "[&_[data-readable]]:hover:bg-tint [&_[data-readable]]:cursor-pointer [&_[data-readable]]:rounded-xs [&_[data-readable]]:transition-colors [&_[data-readable]]:motion-reduce:transition-none",
          "[&_[data-reading]]:bg-tint-strong [&_[data-reading]]:shadow-tint-strong [&_[data-reading]]:text-foreground [&_[data-reading]]:box-decoration-clone [&_[data-reading]]:opacity-100 [&_[data-reading]]:shadow-[0_0_0_3px] [&_[data-reading]]:hover:bg-tint-strong",
          (unavailable || !prepared) && "text-muted-foreground",
        )}
        dangerouslySetInnerHTML={
          prepared && !unavailable ? { __html: prepared.html } : undefined
        }
      />
    </div>
  )
}
