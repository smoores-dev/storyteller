"use client"

import { skipToken } from "@reduxjs/toolkit/query"
import { useEffect, useMemo, useRef } from "react"

import { TooltipButton } from "@v3/_/components/ui/tooltip-button"
import { useTranslation } from "@v3/_/hooks/use-translation"
import { cn } from "@v3/_/lib/utils"

import { type ReportChapterItem } from "@/alignmentReportView"
import * as icon from "@/icons"
import { useGetBookChapterTextQuery } from "@/store/api"
import { type UUID } from "@/uuid"

const STRIP_SELECTOR = "script, style, link, img, svg, video, audio, iframe"

const UNMATCHED = "data-unmatched"
const MATCH = "data-match"

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

function boundsFromIds(
  body: HTMLElement,
  item: ReportChapterItem,
): { start: Element; end: Element } | null {
  const start = body.querySelector(`[id$="-s${item.firstMatchedSentenceId}"]`)
  const end = body.querySelector(`[id$="-s${item.lastMatchedSentenceId}"]`)
  return start && end ? { start, end } : null
}

function boundsFromText(
  body: HTMLElement,
  item: ReportChapterItem,
): { first: Range; last: Range } | null {
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

function markMatches(body: HTMLElement, item: ReportChapterItem): boolean {
  const byId = boundsFromIds(body, item)
  if (byId) {
    for (const node of textNodesOf(body)) {
      const beforeStart =
        byId.start.compareDocumentPosition(node) &
        Node.DOCUMENT_POSITION_PRECEDING
      const afterEnd =
        byId.end.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_FOLLOWING && !byId.end.contains(node)
      if (beforeStart || afterEnd) wrap(node, UNMATCHED)
    }
    byId.start.setAttribute(MATCH, "first")
    byId.end.setAttribute(MATCH, "last")
    return true
  }

  const byText = boundsFromText(body, item)
  if (!byText) return false
  const length = body.textContent.length
  wrapOffsets(body, byText.first, MATCH, "first")
  wrapOffsets(body, byText.last, MATCH, "last")
  wrapOffsets(body, { start: 0, end: byText.first.start }, UNMATCHED)
  wrapOffsets(body, { start: byText.last.end, end: length }, UNMATCHED)
  return true
}

function prepare(
  xhtml: string,
  item: ReportChapterItem,
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
  const marked = markMatches(body, item)
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
}: {
  bookUuid: UUID
  item: ReportChapterItem
}) {
  const t = useTranslation("AlignmentReport")
  const container = useRef<HTMLDivElement>(null)
  const {
    currentData: data,
    isFetching,
    isError,
  } = useGetBookChapterTextQuery(
    item.readHref ? { uuid: bookUuid, href: item.readHref } : skipToken,
  )

  const prepared = useMemo(
    () => (data === undefined ? null : prepare(data, item)),
    [data, item],
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
          "[&_*]:font-sans! [&_[data-unmatched]]:opacity-35 [&_h1]:text-lg [&_h1]:font-medium [&_h2]:text-base [&_h2]:font-medium [&_h3]:font-medium [&_p]:my-2",
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
