import {
  Epub,
  type EpubReader,
  type ManifestItem,
  type NavigationList,
  type ParsedXml,
} from "@storyteller-platform/epub"

import {
  EXCLUSION_RULES,
  FILENAME_TEMPLATES,
  type ExclusionRule,
} from "./exclusionRules.ts"
import { TITLE_RULES, type TitleRule } from "./titleRules.ts"

export { EXCLUSION_RULES, type ExclusionRule, TITLE_RULES, type TitleRule }

export const EXCLUSION_SOURCES = [
  "linear",
  "nav",
  "media-type",
  "landmark",
  "content-type",
  "guide",
  "title",
  "filename",
  "no-text",
] as const
export type ExclusionSource = (typeof EXCLUSION_SOURCES)[number]

export const EXCLUSION_VERDICTS = ["exclude", "review", "include"] as const
export type ExclusionVerdict = (typeof EXCLUSION_VERDICTS)[number]

export const SPINE_ZONES = ["front", "body", "back"] as const
export type SpineZone = (typeof SPINE_ZONES)[number]

export type ExclusionSignal = {
  source: ExclusionSource
  value: string
  verdict: ExclusionVerdict
  division?: boolean
}

export type SpineClassification = {
  index: number
  id: string
  href: string
  zone: SpineZone
  verdict: ExclusionVerdict
  decidedBy: ExclusionSignal | null
  signals: ExclusionSignal[]
}

export const CHAPTER_DECISIONS = ["excluded", "included", "approved"] as const
export type ChapterDecision = (typeof CHAPTER_DECISIONS)[number]

export type AudioExclusion = {
  track: string
  start: number | null
  end: number | null
}

export type AlignmentDecisions = {
  chapters: Record<string, ChapterDecision>
  audio: AudioExclusion[]
}

export const NO_DECISIONS: AlignmentDecisions = { chapters: {}, audio: [] }

export type ExclusionOptions = {
  decisions: AlignmentDecisions
  autoExclude: boolean
}

export const NO_EXCLUSIONS: ExclusionOptions = {
  decisions: NO_DECISIONS,
  autoExclude: true,
}

const MECHANICAL_SOURCES = new Set<ExclusionSource>([
  "linear",
  "nav",
  "media-type",
  "no-text",
])

const VERDICT_SEVERITY: Record<ExclusionVerdict, number> = {
  exclude: 0,
  review: 1,
  include: 2,
}

const ZONE_FRACTION = 0.15

const ZONE_MIN_ITEMS = 6

const CONTENT_TYPE_SHARE = 0.5

const XHTML_TYPES = new Set(["application/xhtml+xml", "text/html"])

export function spineZone(index: number, length: number): SpineZone {
  if (length < 2) return "body"
  const fraction = index / (length - 1)
  const floor = Math.min(ZONE_MIN_ITEMS, Math.floor(length / 2))
  if (fraction <= ZONE_FRACTION || index < floor) return "front"
  if (fraction >= 1 - ZONE_FRACTION || index >= length - floor) return "back"
  return "body"
}

export function normalizeHref(href: string): string {
  const path = href.split("#")[0] ?? href
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function filenameTokens(href: string): string[] {
  const path = normalizeHref(href)
  const name = path.split("/").pop() ?? path
  const stem = name.replace(/\.[^.]+$/, "")
  return stem
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter((token) => token.length > 0)
}

function isFilenameTemplate(href: string): boolean {
  const path = normalizeHref(href)
  const name = path.split("/").pop() ?? path
  const stem = name.replace(/\.[^.]+$/, "")
  return FILENAME_TEMPLATES.some((template) => template.test(stem))
}

function tokensInclude(tokens: string[], phrase: string): boolean {
  const haystack = `-${tokens.join("-")}-`
  const needle = `-${phrase.trim().toLowerCase().split(/\s+/).join("-")}-`
  return haystack.includes(needle)
}

function textLength(xml: ParsedXml): number {
  return Epub.getXhtmlTextContent(xml).replace(/\s+/g, "").length
}

function outermostTypes(xml: ParsedXml, into: Map<string, number>) {
  for (const node of xml) {
    if (Epub.isXmlTextNode(node)) continue
    const children = Epub.getXmlChildren(node)
    const type = Epub.getXmlAttributes(node)["epub:type"]
    if (!type) {
      outermostTypes(children, into)
      continue
    }
    const length = textLength(children)
    for (const value of type.trim().split(/\s+/)) {
      if (value) into.set(value, (into.get(value) ?? 0) + length)
    }
  }
}

export function contentTypes(xml: ParsedXml): string[] {
  const html = Epub.findXmlChildByName("html", xml)
  const body = html && Epub.findXmlChildByName("body", html["html"])
  if (!body) return []
  const found = new Set<string>()
  const bodyType = Epub.getXmlAttributes(body)["epub:type"]
  if (bodyType) {
    for (const value of bodyType.trim().split(/\s+/)) {
      if (value) found.add(value)
    }
  }
  const typed = new Map<string, number>()
  outermostTypes(body["body"], typed)
  const total = textLength(body["body"])
  for (const [type, length] of typed) {
    if (total === 0 || length / total >= CONTENT_TYPE_SHARE) found.add(type)
  }
  return [...found]
}

function hasText(xml: ParsedXml): boolean {
  try {
    return /\S/.test(Epub.getXhtmlTextContent(Epub.getXhtmlBody(xml)))
  } catch {
    return false
  }
}

const HEADINGS = new Set<string>(["h1", "h2", "h3"])

function firstHeading(xml: ParsedXml): string | null {
  for (const node of xml) {
    if (Epub.isXmlTextNode(node)) {
      continue
    }
    const children = Epub.getXmlChildren(node)
    if (HEADINGS.has(Epub.getXmlElementName(node))) {
      const text = Epub.getXhtmlTextContent(children).trim()
      if (text) {
        return text
      }
    }
    const found = firstHeading(children)
    if (found) {
      return found
    }
  }
  return null
}

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’ʼ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export function titleSignals(
  title: string,
  zone: SpineZone,
  language: string,
  rules: TitleRule[] = TITLE_RULES,
): ExclusionSignal[] {
  const normalized = normalizeTitle(title)
  if (!normalized) return []
  const languages = language === "en" ? ["en"] : [language, "en"]
  const signals: ExclusionSignal[] = []
  for (const rule of rules) {
    if (!rule.zones.includes(zone)) {
      continue
    }
    const patterns = languages.flatMap((code) => rule.patterns[code] ?? [])
    if (!patterns.some((pattern) => pattern.test(normalized))) {
      continue
    }
    signals.push({ source: "title", value: rule.match, verdict: rule.verdict })
  }
  return signals
}

function ruleSignal(
  rules: ExclusionRule[],
  source: ExclusionRule["source"],
  value: string,
): ExclusionSignal | null {
  for (const rule of rules) {
    if (rule.source !== source) continue
    if (source === "filename") continue
    if (rule.match !== value) continue
    return {
      source,
      value,
      verdict: rule.verdict,
      ...(rule.division && { division: true }),
    }
  }
  return null
}

function filenameSignals(
  rules: ExclusionRule[],
  href: string,
  zone: SpineZone,
): ExclusionSignal[] {
  if (isFilenameTemplate(href)) return []
  const tokens = filenameTokens(href)
  const signals: ExclusionSignal[] = []
  for (const rule of rules) {
    if (rule.source !== "filename") continue
    if (rule.zones && !rule.zones.includes(zone)) continue
    if (!tokensInclude(tokens, rule.match)) continue
    signals.push({
      source: "filename",
      value: rule.match,
      verdict: rule.verdict,
    })
  }
  return signals
}

function sourceRank(signal: ExclusionSignal): number {
  if (signal.source === "content-type" && signal.division) {
    return EXCLUSION_SOURCES.indexOf("filename") + 0.5
  }
  return EXCLUSION_SOURCES.indexOf(signal.source)
}

function withinSourceRank(signal: ExclusionSignal): number {
  if (signal.source === "content-type") {
    return signal.verdict === "include"
      ? 0
      : signal.verdict === "exclude"
        ? 1
        : 2
  }
  return VERDICT_SEVERITY[signal.verdict]
}

export function decide(signals: ExclusionSignal[]): ExclusionSignal | null {
  let best: ExclusionSignal | null = null
  for (const signal of signals) {
    if (!best) {
      best = signal
      continue
    }
    const bySource = sourceRank(signal) - sourceRank(best)
    if (bySource < 0) {
      best = signal
      continue
    }
    if (bySource === 0 && withinSourceRank(signal) < withinSourceRank(best)) {
      best = signal
    }
  }
  return best
}

export async function classifySpine(
  epub: EpubReader,
  {
    locale = null,
    rules = EXCLUSION_RULES,
    titleRules = TITLE_RULES,
  }: {
    locale?: Intl.Locale | null
    rules?: ExclusionRule[]
    titleRules?: TitleRule[]
  } = {},
): Promise<SpineClassification[]> {
  const spine: (ManifestItem & { linear: boolean })[] =
    await epub.getSpineItems()
  const landmarks = await epub.getLandmarks()
  const guide = await epub.getGuideEntries()
  const toc = await epub.getTableOfContents()
  const language = (locale ?? (await epub.getLanguage()))?.language ?? "en"

  const tocTitles = new Map<string, string>()
  const visitToc = (items: NavigationList) => {
    for (const item of items) {
      if (item.href) {
        const key = normalizeHref(item.href)
        if (!tocTitles.has(key)) {
          tocTitles.set(key, item.title)
        }
      }
      if (item.children) visitToc(item.children)
    }
  }
  visitToc(toc?.children ?? [])

  const landmarkTypes = new Map<string, string[]>()
  const visit = (
    items: { href?: string; type?: string; children?: unknown }[],
  ) => {
    for (const item of items) {
      if (item.href && item.type) {
        const key = normalizeHref(item.href)
        const list = landmarkTypes.get(key) ?? []
        list.push(...item.type.split(/\s+/).filter(Boolean))
        landmarkTypes.set(key, list)
      }

      if (!Array.isArray(item.children)) {
        continue
      }

      visit(item.children as typeof items)
    }
  }

  visit(landmarks?.children ?? [])

  const guideTypes = new Map<string, string[]>()
  for (const entry of guide) {
    const key = normalizeHref(entry.href)
    const list = guideTypes.get(key) ?? []
    list.push(entry.type)
    guideTypes.set(key, list)
  }

  const classifications: SpineClassification[] = []
  for (const [index, item] of spine.entries()) {
    const zone = spineZone(index, spine.length)
    const signals: ExclusionSignal[] = []
    const key = normalizeHref(item.href)

    if (!item.linear) {
      signals.push({ source: "linear", value: "no", verdict: "exclude" })
    }
    if (item.properties?.includes("nav")) {
      signals.push({ source: "nav", value: "nav", verdict: "exclude" })
    }

    const mediaType = item.mediaType ?? "application/xhtml+xml"
    const isDocument = XHTML_TYPES.has(mediaType)
    if (!isDocument) {
      signals.push({
        source: "media-type",
        value: mediaType,
        verdict: "exclude",
      })
    }

    for (const type of landmarkTypes.get(key) ?? []) {
      const signal = ruleSignal(rules, "landmark", type)
      if (signal) {
        signals.push(signal)
      }
    }

    let xml: ParsedXml | null = null
    if (isDocument) {
      try {
        xml = await epub.readXhtmlItemContents(item.id)
      } catch {
        xml = null
      }
    }

    if (xml) {
      for (const type of contentTypes(xml)) {
        const signal = ruleSignal(rules, "content-type", type)
        if (signal) {
          signals.push(signal)
        }
      }
    }

    for (const type of guideTypes.get(key) ?? []) {
      const signal = ruleSignal(rules, "guide", type)
      if (signal) {
        signals.push(signal)
      }
    }

    const title = tocTitles.get(key) ?? (xml ? firstHeading(xml) : null)
    if (title) {
      signals.push(...titleSignals(title, zone, language, titleRules))
    }

    signals.push(...filenameSignals(rules, item.href, zone))

    if (xml && !hasText(xml)) {
      signals.push({
        source: "no-text",
        value: "",
        verdict: "exclude",
      })
    }

    const decidedBy = decide(signals)
    classifications.push({
      index,
      id: item.id,
      href: item.href,
      zone,
      verdict: decidedBy?.verdict ?? "include",
      decidedBy,
      signals,
    })
  }

  return classifications
}

export function chapterAligned(
  classification: Pick<SpineClassification, "verdict" | "decidedBy">,
  decision: ChapterDecision | null | undefined,
  autoExclude: boolean,
): boolean {
  if (decision === "excluded") {
    return false
  }
  if (decision) {
    return true
  }
  if (classification.verdict !== "exclude" || !classification.decidedBy) {
    return true
  }
  if (autoExclude) {
    return false
  }
  return !MECHANICAL_SOURCES.has(classification.decidedBy.source)
}

export function isMechanical(source: ExclusionSource): boolean {
  return MECHANICAL_SOURCES.has(source)
}

export function excludedByRule(
  classification: Pick<SpineClassification, "verdict" | "decidedBy"> | null,
): boolean {
  return (
    !!classification?.decidedBy &&
    classification.verdict === "exclude" &&
    !MECHANICAL_SOURCES.has(classification.decidedBy.source)
  )
}
