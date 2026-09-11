"use client"

import { skipToken } from "@reduxjs/toolkit/query"
import { useEffect, useMemo, useRef } from "react"

import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ReportSpan, type ViewSpineItem } from "@/alignmentReportView"
import * as icon from "@/icons"
import {
  useGetBookChapterGuidedNavigationQuery,
  useGetBookChapterTextQuery,
} from "@/store/api"
import { type UUID } from "@/uuid"
import { GuidedNavigationDocument } from "@readium/shared"
import { clipKey, clipSrc, usePlayer } from "../../audio"

const STRIP_SELECTOR = "script, style, link, img, svg, video, audio, iframe"

const STATE = "data-state"
const MATCH = "data-match"

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
  return { html: body.innerHTML, marked }
}

function scrollToMatch(container: HTMLElement, which: "first" | "last") {
  const target = container.querySelector(`[${MATCH}="${which}"]`)
  if (!target) return
  const box = container.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  container.scrollTo({
    top:
      container.scrollTop +
      (rect.top - box.top) -
      container.clientHeight / 2 +
      rect.height / 2,
    behavior: "smooth",
  })
}

export function ChapterText({
  bookUuid,
  item,
  spans,
}: {
  bookUuid: UUID
  item: ViewSpineItem
  spans: ReportSpan[]
}) {
  const t = useTranslation("AlignmentReport")
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
  const {
    currentData: guidedNavigation,
    isFetching: isGuidedNavigationFetching,
    isError: isGuidedNavigationError,
  } = useGetBookChapterGuidedNavigationQuery(
    item.readHref
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

  useEffect(() => {
    const element = container.current
    if (!element || !prepared) return
    element.scrollTop = 0
    const target = element.querySelector(`[${MATCH}="first"]`)
    if (!target) return
    const box = element.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    element.scrollTop = Math.max(0, rect.top - box.top - 24)
  }, [prepared])

  const unavailable = !item.readHref || isError

  const player = usePlayer()

  useEffect(() => {
    if (!guidedNavigation) return

    const guidedNav = GuidedNavigationDocument.deserialize(guidedNavigation)

    if (!guidedNav) return

    const abortController = new AbortController()

    for (const guided of guidedNav.guided ?? []) {
      for (const child of guided.children ?? []) {
        if (!child.textref || !child.audioref) continue

        if (!child.fragmentId) continue
        const fragment = container.current?.querySelector(
          `#${child.fragmentId}`,
        )
        if (!fragment) {
          console.warn(`Fragment ${child.fragmentId} not found`)
          continue
        }

        fragment.addEventListener(
          "click",
          () => {
            player.play({
              bookUuid,
              path: child.audioFile.split("/").pop() ?? "",
              start: child.clip?.start ?? 0,
              end: child.clip?.end ?? 0,
              name: child.text?.plain ?? "",
              label: child.text?.plain ?? "",
            })
            console.log(child.audioref)
          },
          { signal: abortController.signal },
        )
      }
    }

    return () => {
      abortController.abort()
    }
  }, [guidedNavigation])

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
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
          aria-label={t("detail.jumpFirst")}
          tooltip={t("detail.jumpFirst")}
          disabled={!prepared?.marked}
          onClick={() => {
            if (container.current) scrollToMatch(container.current, "first")
          }}
        >
          <icon.ArrowUp />
        </TooltipButton>
        <TooltipButton
          variant="ghost"
          size="icon-xs"
          aria-label={t("detail.jumpLast")}
          tooltip={t("detail.jumpLast")}
          disabled={!prepared?.marked}
          onClick={() => {
            if (container.current) scrollToMatch(container.current, "last")
          }}
        >
          <icon.ArrowDown />
        </TooltipButton>
      </div>
      <div
        ref={container}
        className={cn(
          "max-h-[60vh] min-h-24 overflow-y-auto rounded-md border px-4 py-3 text-sm leading-relaxed",
          "[&_[data-state=interpolated]]:decoration-moderate/70 [&_[data-state=interpolated]]:text-moderate/70 [&_*]:font-sans! [&_[data-state=dropped]]:line-through [&_[data-state=dropped]]:opacity-35 [&_[data-state=interpolated]]:underline [&_[data-state=interpolated]]:decoration-dotted [&_[data-state=interpolated]]:decoration-2 [&_[data-state=interpolated]]:underline-offset-4 [&_[data-state=unmatched]]:opacity-35 [&_h1]:text-lg [&_h1]:font-medium [&_h2]:text-base [&_h2]:font-medium [&_h3]:font-medium [&_p]:my-2",
          "[&_[data-match]]:bg-highlight-bg/70 [&_[data-match]]:border-highlight [&_[data-match]]:dark:bg-highlight/25 [&_[data-match]]:border-b [&_[data-match]]:box-decoration-clone",
          (unavailable || !prepared) && "text-muted-foreground",
        )}
        dangerouslySetInnerHTML={
          prepared && !unavailable ? { __html: prepared.html } : undefined
        }
      />
    </div>
  )
}
